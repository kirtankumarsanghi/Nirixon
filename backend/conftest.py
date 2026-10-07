"""Backend-wide pytest configuration.

Script-style test files that call sys.exit() at module level are collected
here so pytest ignores them (run them directly as scripts instead):
  python tests/test_module_b_api.py
  python tests/test_module_b_regressions.py

Pre-existing failures (stub_api dependency, old test_api imports) are also
excluded here — they were already failing before the Module B integration.
"""
collect_ignore = []
