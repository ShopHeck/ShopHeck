#!/usr/bin/env python3
"""
Add the watchOS companion target to ios/App/App.xcodeproj.

WHY A SCRIPT AND NOT HAND-EDITING. `project.pbxproj` is an OpenStep plist with
24-hex-digit object ids and cross-references in six directions; a malformed one
breaks the iOS build, and therefore the TestFlight pipeline, for everyone. This
runs the change through a real parser and serializer (the `pbxproj` package), so
the output is structurally valid by construction rather than by proofreading.

WHY IT IS COMMITTED RATHER THAN RUN AND DELETED. It is the record of exactly
what was added and why, and it is idempotent — running it against a project that
already has the target is a no-op. If the watch target is ever lost to a
regenerated project (`npx cap sync` does not touch targets, but a manual
recreate would), this rebuilds it identically instead of from memory.

    pip install pbxproj openstep_parser
    python3 scripts/add-watch-target.py

Everything it configures is documented in docs/apple-watch.md § Adding the
target. The two things it deliberately does NOT do are the two that need an
Apple Developer account rather than a file edit: registering the watch App ID
(`app.fightcamptraining.watchkitapp`) and its provisioning profile.
"""

import os
import sys

try:
    from pbxproj import XcodeProject
    from pbxproj.pbxsections import (
        PBXBuildFile, PBXCopyFilesBuildPhase, PBXFileReference,
        PBXFrameworksBuildPhase, PBXGenericObject, PBXGroup, PBXResourcesBuildPhase,
        PBXSourcesBuildPhase,
    )
except ImportError:  # pragma: no cover - dependency hint
    sys.exit("pip install pbxproj openstep_parser")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = os.path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj')

WATCH_TARGET = 'FightCampWatch'
WATCH_GROUP = 'WatchApp'
HOST_BUNDLE_ID = 'app.fightcamptraining'
# Apple requires the watch bundle id to be the host id plus a suffix. Anything
# else and the pairing is rejected at install time, not at build time.
WATCH_BUNDLE_ID = f'{HOST_BUNDLE_ID}.watchkitapp'

# Order matters only for readability in Xcode's navigator.
WATCH_SOURCES = [
    'FightCampWatchApp.swift',
    'RoundTimerView.swift',
    'TimerModel.swift',
    'RoundEngine.swift',
    'WorkoutHeartRate.swift',
    'WatchConnectivityClient.swift',
    'WatchMessages.swift',
]
# Compiled by BOTH targets. WatchConnectivity payloads are untyped
# [String: Any], so a key renamed on one side and not the other fails silently
# on a device, mid-round. Shared compilation is what makes it a compile error.
SHARED_SOURCE = 'WatchMessages.swift'

# Mirrors what the App and TimerLiveActivity targets already carry, so the three
# stay signable and versionable by the same Fastlane lanes.
DEVELOPMENT_TEAM = 'WV4L598A44'
MARKETING_VERSION = '1.0.3'
CURRENT_PROJECT_VERSION = '2'
# watchOS 9 is the floor for the SwiftUI and HKWorkoutSession APIs the watch app
# uses, and matches the iOS 16.1 floor the Live Activity extension already sets.
WATCHOS_DEPLOYMENT_TARGET = '9.0'

COMMON_SETTINGS = {
    'CODE_SIGN_STYLE': 'Automatic',
    'CODE_SIGN_ENTITLEMENTS': f'{WATCH_GROUP}/{WATCH_TARGET}.entitlements',
    'CURRENT_PROJECT_VERSION': CURRENT_PROJECT_VERSION,
    'DEVELOPMENT_TEAM': DEVELOPMENT_TEAM,
    # The plist is checked in rather than generated: WKBackgroundModes is an
    # array with no INFOPLIST_KEY_ equivalent, and the companion bundle id has
    # to be exact.
    'GENERATE_INFOPLIST_FILE': 'NO',
    'INFOPLIST_FILE': f'{WATCH_GROUP}/Info.plist',
    'MARKETING_VERSION': MARKETING_VERSION,
    'PRODUCT_BUNDLE_IDENTIFIER': WATCH_BUNDLE_ID,
    'PRODUCT_NAME': '$(TARGET_NAME)',
    'SDKROOT': 'watchos',
    # NO, so the watch app is embedded in the host's archive rather than
    # installed as a product of its own.
    'SKIP_INSTALL': 'YES',
    'SWIFT_VERSION': '5.0',
    # 4 = Apple Watch. The phone targets are "1,2".
    'TARGETED_DEVICE_FAMILY': '4',
    'WATCHOS_DEPLOYMENT_TARGET': WATCHOS_DEPLOYMENT_TARGET,
    'SUPPORTED_PLATFORMS': 'watchsimulator watchos',
    'ASSETCATALOG_COMPILER_APPICON_NAME': 'AppIcon',
}


def obj(project, isa, **fields):
    """Create and register an object with a fresh 24-hex id."""
    # `_id` goes through parse() rather than being assigned afterwards: parse
    # converts a 24-hex string into a PBXKey, and only a PBXKey serializes as a
    # bare identifier. Assigning it after the fact leaves a plain str, which is
    # written back QUOTED — a key Xcode then reads as a different object from
    # every unquoted reference to it.
    o = PBXGenericObject().parse({'_id': PBXGenericObject._generate_id(), 'isa': isa, **fields})
    project.objects[o.get_id()] = o
    return o


def main():
    project = XcodeProject.load(PROJECT)
    objects = project.objects

    if any(t.name == WATCH_TARGET for t in objects.get_targets()):
        print(f'{WATCH_TARGET} target already present — nothing to do.')
        return 0

    app_target = next(t for t in objects.get_targets() if t.name == 'App')
    root = objects[project['rootObject']]
    main_group = objects[root.mainGroup]
    products_group = objects[root.productRefGroup]

    # ── Group + source file references ──────────────────────────────────────
    group = PBXGroup.create(path=WATCH_GROUP, name=WATCH_GROUP)
    objects[group.get_id()] = group

    file_refs = {}
    children = []
    for name in WATCH_SOURCES + ['Assets.xcassets', 'Info.plist', f'{WATCH_TARGET}.entitlements']:
        ref = PBXFileReference.create(path=name, tree='<group>')
        objects[ref.get_id()] = ref
        children.append(ref.get_id())
        file_refs[name] = ref
    group['children'] = children

    main_group['children'] = list(main_group.children) + [group.get_id()]

    # ── Product reference ───────────────────────────────────────────────────
    product = obj(
        project, 'PBXFileReference',
        explicitFileType='wrapper.application',
        includeInIndex='0',
        path=f'{WATCH_TARGET}.app',
        sourceTree='BUILT_PRODUCTS_DIR',
    )
    products_group['children'] = list(products_group.children) + [product.get_id()]

    # ── Build phases ────────────────────────────────────────────────────────
    source_build_files = []
    for name in WATCH_SOURCES:
        bf = PBXBuildFile.create(file_refs[name])
        objects[bf.get_id()] = bf
        source_build_files.append(bf.get_id())

    sources = PBXSourcesBuildPhase.create(files=source_build_files)
    frameworks = PBXFrameworksBuildPhase.create(files=[])
    # The app icon. A watchOS app with no AppIcon fails App Store validation,
    # so the catalog is a build input rather than a nicety.
    icons = PBXBuildFile.create(file_refs['Assets.xcassets'])
    objects[icons.get_id()] = icons
    resources = PBXResourcesBuildPhase.create(files=[icons.get_id()])
    for phase in (sources, frameworks, resources):
        objects[phase.get_id()] = phase

    # ── Build configurations ────────────────────────────────────────────────
    config_ids = []
    for config_name in ('Debug', 'Release'):
        settings = dict(COMMON_SETTINGS)
        if config_name == 'Release':
            settings['VALIDATE_PRODUCT'] = 'YES'
        config = obj(
            project, 'XCBuildConfiguration',
            buildSettings=settings, name=config_name,
        )
        config_ids.append(config.get_id())

    config_list = obj(
        project, 'XCConfigurationList',
        buildConfigurations=config_ids,
        defaultConfigurationIsVisible='0',
        defaultConfigurationName='Release',
    )

    # ── The target ──────────────────────────────────────────────────────────
    target = obj(
        project, 'PBXNativeTarget',
        buildConfigurationList=config_list.get_id(),
        buildPhases=[sources.get_id(), frameworks.get_id(), resources.get_id()],
        buildRules=[],
        dependencies=[],
        name=WATCH_TARGET,
        productName=WATCH_TARGET,
        productReference=product.get_id(),
        productType='com.apple.product-type.application',
    )
    root['targets'] = list(root.targets) + [target.get_id()]

    # ── Host app: dependency + Embed Watch Content ──────────────────────────
    # The dependency is what orders the build; the copy phase is what actually
    # puts the .app inside the host bundle. Both are required — a watch app
    # that builds but is not embedded ships an iOS app with no watch app in it,
    # and the failure is invisible until a device tries to install it.
    proxy = obj(
        project, 'PBXContainerItemProxy',
        containerPortal=str(project['rootObject']),
        # 1 = a native target in this project (2 would be a product reference).
        proxyType='1',
        remoteGlobalIDString=target.get_id(),
        remoteInfo=WATCH_TARGET,
    )

    dependency = obj(
        project, 'PBXTargetDependency',
        name=WATCH_TARGET, target=target.get_id(), targetProxy=proxy.get_id(),
    )
    app_target['dependencies'] = list(app_target.dependencies) + [dependency.get_id()]

    embed_file = PBXBuildFile.create(product)
    embed_file['settings'] = PBXGenericObject().parse({'ATTRIBUTES': ['RemoveHeadersOnCopy']})
    objects[embed_file.get_id()] = embed_file

    # dstSubfolderSpec 16 = Products Directory; the Watch subpath is what makes
    # it the watch slot rather than a loose bundle beside the executable.
    embed_phase = PBXCopyFilesBuildPhase.create(
        name='Embed Watch Content',
        files=[embed_file.get_id()],
        dest_path='$(CONTENTS_FOLDER_PATH)/Watch',
        dest_subfolder_spec='16',
    )
    objects[embed_phase.get_id()] = embed_phase
    app_target['buildPhases'] = list(app_target.buildPhases) + [embed_phase.get_id()]

    # ── The shared wire-format file, compiled by the host too ───────────────
    shared = PBXBuildFile.create(file_refs[SHARED_SOURCE])
    objects[shared.get_id()] = shared
    app_sources = next(
        objects[p] for p in app_target.buildPhases
        if objects[p].isa == 'PBXSourcesBuildPhase'
    )
    app_sources['files'] = list(app_sources.files) + [shared.get_id()]

    # ── Target attributes ───────────────────────────────────────────────────
    root['attributes']['TargetAttributes'][target.get_id()] = PBXGenericObject().parse({
        'CreatedOnToolsVersion': '15.0',
        'ProvisioningStyle': 'Automatic',
    })

    project.save()
    print(f'Added {WATCH_TARGET} ({target.get_id()}) and embedded it in App.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
