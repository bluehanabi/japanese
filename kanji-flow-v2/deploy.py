#!/usr/bin/env python3
"""
Kanji Flow 2.0 — 서버 배포 스크립트
paramiko를 사용해서 MacBook 서버에 SSH 접속 후 파일 전송 및 서버 기동
"""
import paramiko
import os
import sys

HOST = "192.168.10.35"
PORT = 22
USER = "seop"
PASS = "@gkskql1149"
REMOTE_DIR = "/Users/seop/kanji-flow-v2"
LOCAL_DIR  = r"f:\Program\kanji-flow-v2"

FILES = [
    ("kanji_data.py",          ""),
    ("srs.py",                 ""),
    ("database.py",            ""),
    ("server.py",              ""),
    ("static/index.html",      "static/"),
    ("static/css/style.css",   "static/css/"),
    ("static/js/app.js",       "static/js/"),
]

def run_ssh(client, cmd, desc=""):
    print(f"  ▶ {desc or cmd}")
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out: print(f"    {out}")
    if err: print(f"    [err] {err}")
    return out

def main():
    print("=" * 55)
    print("  Kanji Flow 2.0 서버 배포 시작")
    print("=" * 55)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        print(f"\n[1] SSH 연결 중 → {HOST}:{PORT}")
        client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
        print("    ✅ 연결 성공!")

        # 1) 기존 서버 프로세스 종료
        print("\n[2] 기존 서버 프로세스 종료...")
        run_ssh(client, "pkill -f 'python.*server.py' || true", "기존 서버 종료")
        run_ssh(client, "fuser -k 8005/tcp || true", "포트 8005 강제 해제")

        # 2) 디렉토리 생성
        print("\n[3] 디렉토리 생성...")
        run_ssh(client, f"mkdir -p {REMOTE_DIR}/static/css {REMOTE_DIR}/static/js", "폴더 생성")

        # 3) 파일 전송 (SFTP)
        print("\n[4] 파일 전송 중...")
        sftp = client.open_sftp()
        for local_rel, remote_rel in FILES:
            local_path  = os.path.join(LOCAL_DIR, local_rel.replace("/", os.sep))
            remote_path = f"{REMOTE_DIR}/{remote_rel}{os.path.basename(local_rel)}"
            if not os.path.exists(local_path):
                print(f"    ⚠️  파일 없음: {local_path}")
                continue
            sftp.put(local_path, remote_path)
            size = os.path.getsize(local_path)
            print(f"    ✅ {local_rel} ({size:,} bytes)")
        sftp.close()

        # 4) Python 패키지 설치
        print("\n[5] Python 패키지 설치...")
        run_ssh(client, f"pip3 install flask flask-cors --quiet 2>&1 | tail -3", "Flask 설치")

        # 5) DB 초기화 테스트
        print("\n[6] DB 초기화 확인...")
        run_ssh(client,
            f"cd {REMOTE_DIR} && python3 database.py",
            "DB 초기화")

        # 6) 서버 백그라운드 기동
        print("\n[7] 서버 기동 (포트 8005)...")
        run_ssh(client,
            f"cd {REMOTE_DIR} && nohup python3 server.py > /tmp/kanji-flow.log 2>&1 &",
            "서버 시작")

        import time
        time.sleep(3)

        # 7) 확인
        out = run_ssh(client, "curl -s http://localhost:8005/api/stats | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'총 카드: {d[\\\"total_cards\\\"]}개')\" 2>&1", "API 응답 확인")

        run_ssh(client, "tail -5 /tmp/kanji-flow.log", "서버 로그")

        print("\n" + "=" * 55)
        print("  ✅ 배포 완료!")
        print(f"  🌐 http://192.168.10.35:8005")
        print(f"  🌐 http://211.109.91.64:8005 (외부)")
        print("=" * 55)

    except Exception as e:
        print(f"\n❌ 오류: {e}")
        sys.exit(1)
    finally:
        client.close()

if __name__ == "__main__":
    main()
