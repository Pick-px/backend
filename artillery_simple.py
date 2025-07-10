import csv
import json

CANVAS_ID = 1
TARGET_URL = "http://localhost:3000"

# CSV 데이터를 직접 JSON으로 변환
def csv_to_json(csv_path, start_user_id):
    pixels = []
    with open(csv_path, newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        for i, row in enumerate(reader):
            pixels.append({
                "x": int(row["x"]),
                "y": int(row["y"]),
                "color": row["color"],
                "user_id": start_user_id + i
            })
    return pixels

# 두 팀 데이터 합치기
team1 = csv_to_json("pixels_nexon.csv", 1)
team2 = csv_to_json("pixels_krafton.csv", len(team1) + 1)
all_pixels = team1 + team2

# 페이로드 JSON 파일 생성
with open("payload.json", "w") as f:
    for pixel in all_pixels:
        json.dump(pixel, f)
        f.write('\n')

# Artillery 설정 파일 생성
config = {
    "config": {
        "target": TARGET_URL,
        "phases": [
            {"arrivalCount": len(all_pixels), "duration": 80}
        ],
        "engines": {
            "socketio": {
                "timeout": 30000,
                "transports": ["websocket"],
                "upgrade": False
            }
        },
        "payload": {
            "path": "payload.json",
            "fields": ["x", "y", "color", "user_id"]
        }
    },
    "scenarios": [
        {
            "engine": "socketio",
            "flow": [
                {
                    "emit": {
                        "channel": "draw_pixel_simul",
                        "data": {
                            "canvas_id": str(CANVAS_ID),
                            "x": "{{ x }}",
                            "y": "{{ y }}",
                            "color": "{{ color }}",
                            "user_id": "{{ user_id }}"
                        }
                    }
                }
            ]
        }
    ]
}

with open("artillery_config.json", "w") as f:
    json.dump(config, f, indent=2)

print("✅ 파일 생성 완료:")
print("- payload.json")
print("- artillery_config.json")
print("\n실행 명령어:")
print("artillery run artillery_config.json")