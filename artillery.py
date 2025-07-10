import csv
import json

CANVAS_ID = 1
TARGET_URL = "http://localhost:3000"

# 팀별 데이터 로드 함수
def load_team_pixels(csv_path, start_user_id):
    pixels = []
    with open(csv_path, newline='') as csvfile:
        reader = csv.DictReader(csvfile)
        for i, pixel in enumerate(reader):
            pixels.append({
                "x": int(pixel["x"]),
                "y": int(pixel["y"]),
                "color": pixel["color"],
                "user_id": start_user_id + i
            })
    return pixels

# Artillery 설정 생성 함수
def create_artillery_config(pixels, team_name):
    # 왼쪽에서 오른쪽으로 순차적 정렬
    pixels.sort(key=lambda p: p["x"])
    
    scenarios = []
    for i, pixel in enumerate(pixels):
        scenario = {
            "engine": "socketio",
            "flow": [
                {"think": i * 0.05},  # 0.05초 간격
                {
                    "emit": {
                        "channel": "draw_pixel_simul",
                        "data": {
                            "canvas_id": str(CANVAS_ID),
                            "x": pixel["x"],
                            "y": pixel["y"],
                            "color": pixel["color"],
                            "user_id": pixel["user_id"]
                        }
                    }
                }
            ]
        }
        scenarios.append(scenario)
    
    return {
        "config": {
            "target": TARGET_URL,
            "phases": [
                {"arrivalRate": 30, "duration": int(len(pixels) * 0.05 + 10)}
            ],
            "engines": {
                "socketio": {}
            }
        },
        "scenarios": scenarios
    }

# 각 팀 데이터 로드
nexon_pixels = load_team_pixels("pixels_nexon.csv", 1)
krafton_pixels = load_team_pixels("pixels_krafton.csv", 10000)

# 각 팀별 Artillery 설정 생성
nexon_config = create_artillery_config(nexon_pixels, "nexon")
krafton_config = create_artillery_config(krafton_pixels, "krafton")

# 각각 별도 파일로 저장
with open("artillery_nexon.json", "w") as f:
    json.dump(nexon_config, f, indent=2)

with open("artillery_krafton.json", "w") as f:
    json.dump(krafton_config, f, indent=2)

print(f"✅ 팀별 Artillery 설정 파일 생성 완료!")
print(f"📊 Nexon: {len(nexon_pixels)}픽셀 - artillery_nexon.json")
print(f"📊 Krafton: {len(krafton_pixels)}픽셀 - artillery_krafton.json")
print(f"")
print(f"🚀 동시 실행 명령어:")
print(f"npx artillery run artillery_nexon.json &")
print(f"npx artillery run artillery_krafton.json &")
print(f"")
print(f"🏁 두 팀이 동시에 시작해서 서로 경쟁!")