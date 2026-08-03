from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

def edit(path: str, old: str, new: str) -> None:
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    if old in text:
        p.write_text(text.replace(old, new, 1), encoding='utf-8')

# RESET no longer performs sync side effects inside the reducer.
edit(
    'src/context/AppContext.tsx',
    "import { fetchServerSubscription, clearIdMap } from '../lib/sync';",
    "import { fetchServerSubscription } from '../lib/sync';",
)

# The discarded source account id is intentionally omitted from the transferred row.
edit(
    'netlify/functions/revenuecat-webhook.ts',
    "      const { user_id: _oldUser, ...grant } = source;\n      const { error }",
    "      const { user_id: _oldUser, ...grant } = source;\n      void _oldUser;\n      const { error }",
)

# The account-scope hydration effect intentionally dispatches a replacement state.
edit(
    'src/context/AppContext.tsx',
    "    dispatch({ type: 'SET_STATE', payload: loaded });",
    "    // eslint-disable-next-line react-hooks/set-state-in-effect\n    dispatch({ type: 'SET_STATE', payload: loaded });",
)

print('Final compile safeguards applied.')
