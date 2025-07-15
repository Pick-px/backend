-- game_user_result 중복 방지 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_user_result_user_canvas
  ON game_user_result (user_id, canvas_id); 