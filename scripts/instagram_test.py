import os
import sys
import json
import argparse
import requests
from urllib.parse import quote_plus

GRAPH_VERSION_DEFAULT = "v24.0"  # 適宜変えてOK

def getenv_required(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f"Missing env var: {name}")
    return v

def get_app_access_token(app_id: str, app_secret: str, graph_version: str) -> str:
    """
    App Access Token を client_credentials で取得
    https://graph.facebook.com/{version}/oauth/access_token
    """
    url = f"https://graph.facebook.com/{graph_version}/oauth/access_token"
    params = {
        "client_id": app_id,
        "client_secret": app_secret,
        "grant_type": "client_credentials",
    }
    r = requests.get(url, params=params, timeout=20)
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text}

    if r.status_code != 200:
        raise RuntimeError(f"[get_app_access_token] HTTP {r.status_code}: {json.dumps(data, ensure_ascii=False)}")

    token = data.get("access_token")
    if not token:
        raise RuntimeError(f"[get_app_access_token] access_token not found: {json.dumps(data, ensure_ascii=False)}")
    return token

def call_instagram_oembed(
    post_url: str,
    access_token: str,
    graph_version: str,
    omit_script: bool = True,
    maxwidth: int | None = None
) -> dict:
    """
    Instagram oEmbed を呼ぶ
    GET https://graph.facebook.com/{version}/instagram_oembed?url=...&access_token=...
    """
    endpoint = f"https://graph.facebook.com/{graph_version}/instagram_oembed"
    params = {
        "url": post_url,
        "access_token": access_token,
        "hidecaption": "false",
    }
    if omit_script:
        params["omitscript"] = "true"
    if maxwidth is not None:
        params["maxwidth"] = str(maxwidth)

    r = requests.get(endpoint, params=params, timeout=20)
    content_type = r.headers.get("content-type", "")
    try:
        data = r.json()
    except Exception:
        data = {"raw": r.text, "content_type": content_type}

    return {
        "http_status": r.status_code,
        "final_url": r.url,
        "response": data,
    }

def pretty_print_result(tag: str, result: dict) -> None:
    print("=" * 80)
    print(f"[{tag}] HTTP {result['http_status']}")
    print(f"Final URL: {result.get('final_url')}")
    print("-" * 80)

    resp = result.get("response", {})
    print(json.dumps(resp, ensure_ascii=False, indent=2))

    # oEmbedでよく見る主要フィールド（存在すれば）
    if isinstance(resp, dict):
        keys = ["title", "author_name", "author_url", "thumbnail_url", "provider_name", "provider_url", "html"]
        picked = {k: resp.get(k) for k in keys if k in resp}
        if picked:
            print("-" * 80)
            print("Picked fields:")
            print(json.dumps(picked, ensure_ascii=False, indent=2))

def main():
    parser = argparse.ArgumentParser(description="Instagram oEmbed quick test")
    parser.add_argument("--post-url", required=True, help="Instagramの投稿URL（公開投稿）")
    parser.add_argument("--graph-version", default=GRAPH_VERSION_DEFAULT, help="Graph API version e.g. v24.0")
    parser.add_argument("--use-client-token", action="store_true",
                        help="APP_ID|CLIENT_TOKEN 形式で叩く（CLIENT_TOKEN環境変数が必要）")
    parser.add_argument("--omit-script", action="store_true", default=True,
                        help="omitscript=true（デフォルト）")
    parser.add_argument("--maxwidth", type=int, default=None, help="maxwidth (optional)")
    args = parser.parse_args()

    app_id = getenv_required("APP_ID")

    # 1) まずは App ID + App Secret で App Access Token を取得して叩く
    if not args.use_client_token:
        app_secret = getenv_required("APP_SECRET")
        try:
            token = get_app_access_token(app_id, app_secret, args.graph_version)
            print(f"Got app access token (prefix): {token[:15]}...")  # 全表示しない
        except Exception as e:
            print(f"Failed to get app access token: {e}", file=sys.stderr)
            sys.exit(1)

        result = call_instagram_oembed(
            post_url=args.post_url,
            access_token=token,
            graph_version=args.graph_version,
            omit_script=args.omit_script,
            maxwidth=args.maxwidth,
        )
        pretty_print_result("APP_ACCESS_TOKEN", result)

    # 2) 代替：client token を持ってるなら APP_ID|CLIENT_TOKEN 形式でも試せる
    else:
        client_token = getenv_required("CLIENT_TOKEN")
        # docs注意：client access token を使う場合、APP_ID|CLIENT_TOKEN 形式が必要 :contentReference[oaicite:3]{index=3}
        token = f"{app_id}|{client_token}"
        result = call_instagram_oembed(
            post_url=args.post_url,
            access_token=token,
            graph_version=args.graph_version,
            omit_script=args.omit_script,
            maxwidth=args.maxwidth,
        )
        pretty_print_result("APP_ID|CLIENT_TOKEN", result)

if __name__ == "__main__":
    main()