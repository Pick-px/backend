import csv
import json

CANVAS_ID = 1
TARGET_URL = "http://localhost:3000"

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

# 팀1: nexon (0,0에서 시작)
team1 = csv_to_json("pixels_nexon.csv", 1)

# 팀2: krafton (63,63에서 시작하도록 좌표 변환)
team2_raw = csv_to_json("pixels_krafton.csv", 10000)
team2 = []
for pixel in team2_raw:
    # krafton 데이터를 63,63에서 시작하도록 좌표 변환
    new_x = 63 - pixel["x"]
    new_y = 63 - pixel["y"]
    team2.append({
        "x": new_x,
        "y": new_y,
        "color": pixel["color"],
        "user_id": pixel["user_id"]
    })

# 각 팀별로 페이로드 파일 생성
with open("team1_payload.json", "w") as f:
    for pixel in team1:
        json.dump(pixel, f)
        f.write('\n')

with open("team2_payload.json", "w") as f:
    for pixel in team2:
        json.dump(pixel, f)
        f.write('\n')

# Artillery 설정 - 두 팀이 동시에 실행
config = {
    "config": {
        "target": TARGET_URL,
        "phases": [
            {"arrivalCount": len(team1) + len(team2), "duration": 80}
        ],
        "engines": {
            "socketio": {
                "timeout": 30000,
                "transports": ["websocket"],
                "upgrade": False
            }
        }
    },
    "scenarios": [
        {
            "name": "Team Nexon (0,0 시작)",
            "weight": 50,
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
            ],
            "payload": {
                "path": "team1_payload.json",
                "fields": ["x", "y", "color", "user_id"]
            }
        },
        {
            "name": "Team Krafton (63,63 시작)",
            "weight": 50,
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
            ],
            "payload": {
                "path": "team2_payload.json",
                "fields": ["x", "y", "color", "user_id"]
            }
        }
    ]
}

with open("artillery_battle.json", "w") as f:
    json.dump(config, f, indent=2)

print("✅ 배틀 시나리오 파일 생성 완료:")
print("- team1_payload.json (Nexon팀: 0,0 시작)")
print("- team2_payload.json (Krafton팀: 63,63 시작)")
print("- artillery_battle.json")
print(f"\n팀1 픽셀 수: {len(team1)}")
print(f"팀2 픽셀 수: {len(team2)}")
print("\n실행 명령어:")
print("artillery run artillery_battle.json")