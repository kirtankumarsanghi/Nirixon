"""Generate a VAPID keypair for Web Push.

Usage:
    python backend/scripts/generate_vapid_keys.py

Copy the two lines into `.env`. The public key is also exposed to the browser by
GET /api/notifications/vapid-public-key.
"""

from __future__ import annotations

import base64


def main() -> int:
    try:
        from py_vapid import Vapid
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            "py-vapid is required (installed with pywebpush). Run: pip install pywebpush"
        ) from exc

    from cryptography.hazmat.primitives import serialization

    vapid = Vapid()
    vapid.generate_keys()
    private_der = vapid.private_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_raw = vapid.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )
    public_key = base64.urlsafe_b64encode(public_raw).rstrip(b"=").decode("ascii")
    private_key = base64.urlsafe_b64encode(private_der).rstrip(b"=").decode("ascii")

    print("# Add these single-line values to .env (keep the private key secret)")
    print(f"VAPID_PUBLIC_KEY={public_key}")
    print(f"VAPID_PRIVATE_KEY={private_key}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
