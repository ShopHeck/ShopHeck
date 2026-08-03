from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def replace(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old not in text:
        if new in text:
            return
        raise RuntimeError(f'{path}: migration pattern not found')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

replace(
    'src/utils/accountStorage.ts',
    "export function setActiveStorageOwner(owner: StorageOwner, storage: StorageLike = browserStorage()): void {\n  storage.setItem(ACTIVE_OWNER_KEY, owner);\n}\n",
    "export function hasExplicitStorageOwner(storage: StorageLike = browserStorage()): boolean {\n  return storage.getItem(ACTIVE_OWNER_KEY) !== null;\n}\n\nexport function setActiveStorageOwner(owner: StorageOwner, storage: StorageLike = browserStorage()): void {\n  storage.setItem(ACTIVE_OWNER_KEY, owner);\n}\n",
)

replace(
    'src/context/AppContext.tsx',
    "import { getActiveStorageOwner, setActiveStorageOwner, storageOwnerForUser } from '../utils/accountStorage';",
    "import { getActiveStorageOwner, hasExplicitStorageOwner, setActiveStorageOwner, storageOwnerForUser } from '../utils/accountStorage';",
)
replace(
    'src/context/AppContext.tsx',
    "  const hydratedOwnerRef = useRef(getActiveStorageOwner());\n  const switchingOwnerRef = useRef(false);",
    "  const hydratedOwnerRef = useRef(getActiveStorageOwner());\n  const switchingOwnerRef = useRef(false);\n  const legacyOwnerUnsetRef = useRef(!hasExplicitStorageOwner());",
)
replace(
    'src/context/AppContext.tsx',
    "    switchingOwnerRef.current = true;\n    setActiveStorageOwner(nextOwner);\n    let loaded = loadState(nextOwner);",
    "    switchingOwnerRef.current = true;\n    // First launch after the account-scoping update: claim the existing guest/\n    // legacy cache for the first authenticated account instead of hiding or\n    // duplicating unsynced camp data. The explicit owner marker makes this a\n    // one-time migration; every later account switch loads its own namespace.\n    if (user?.id && legacyOwnerUnsetRef.current) {\n      setActiveStorageOwner(nextOwner);\n      hydratedOwnerRef.current = nextOwner;\n      legacyOwnerUnsetRef.current = false;\n      saveState(state, nextOwner);\n      queueMicrotask(() => { switchingOwnerRef.current = false; });\n      return;\n    }\n    setActiveStorageOwner(nextOwner);\n    let loaded = loadState(nextOwner);",
)
replace(
    'src/context/AppContext.tsx',
    "  }, [authLoading, user?.id]);",
    "  }, [authLoading, user?.id, state]);",
)

replace(
    'src/lib/sync.ts',
    "    const raw = localStorage.getItem(idMapKey(userId));\n    return raw ? JSON.parse(raw) : {};",
    "    let raw = localStorage.getItem(idMapKey(userId));\n    if (!raw) {\n      // One-time migration from the pre-account-scoping sync ledger. Keeping\n      // these UUID mappings prevents an upgrade from duplicating every cloud row.\n      raw = localStorage.getItem(IDMAP_PREFIX);\n      if (raw) {\n        localStorage.setItem(idMapKey(userId), raw);\n        localStorage.removeItem(IDMAP_PREFIX);\n      }\n    }\n    return raw ? JSON.parse(raw) : {};",
)
replace(
    'src/lib/sync.ts',
    "    const raw = localStorage.getItem(hashKey(userId));\n    if (!raw) return emptyHashStore(userId);\n    const parsed = JSON.parse(raw) as HashStore;",
    "    let raw = localStorage.getItem(hashKey(userId));\n    if (!raw) {\n      const legacy = localStorage.getItem(HASH_PREFIX);\n      if (legacy) {\n        const candidate = JSON.parse(legacy) as HashStore;\n        if (candidate?.userId === userId) {\n          raw = legacy;\n          localStorage.setItem(hashKey(userId), legacy);\n          localStorage.removeItem(HASH_PREFIX);\n        }\n      }\n    }\n    if (!raw) return emptyHashStore(userId);\n    const parsed = JSON.parse(raw) as HashStore;",
)

# Extend the account-storage unit coverage for one-time migration detection.
replace(
    'tests/unit/accountStorage.test.ts',
    "import { eraseAllFightCampData, eraseStorageOwner, scopedStorageKey, storageOwnerForUser, type StorageLike } from '../../src/utils/accountStorage.ts';",
    "import { eraseAllFightCampData, eraseStorageOwner, hasExplicitStorageOwner, scopedStorageKey, setActiveStorageOwner, storageOwnerForUser, type StorageLike } from '../../src/utils/accountStorage.ts';",
)
replace(
    'tests/unit/accountStorage.test.ts',
    "test('account namespaces cannot overlap', () => {",
    "test('the legacy owner marker is detected exactly once', () => {\n  const storage = new MemoryStorage();\n  assert.equal(hasExplicitStorageOwner(storage), false);\n  setActiveStorageOwner('user:a', storage);\n  assert.equal(hasExplicitStorageOwner(storage), true);\n});\n\ntest('account namespaces cannot overlap', () => {",
)

print('Legacy account and sync migration safeguards applied.')
