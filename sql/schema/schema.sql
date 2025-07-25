\connect nestjs_db;


create table if not exists users
(
    id         bigserial,
    email      varchar(100) not null,
    password   varchar(100),
    created_at timestamp    not null,
    updated_at timestamp    not null,
    user_name  varchar(50)  not null,
    role varchar(10) not null default 'user',
    primary key (id),
    unique (email)
);

alter table users
    owner to pixel_user;

create table if not exists canvases
(
    id         serial,
    title      varchar(50) not null,
    type       varchar(50)        not null,
    created_at timestamp   not null default now(),
    started_at timestamp   not null default now(),
    ended_at   timestamp   default null,
    size_x     integer     not null,
    size_y     integer     not null,
    primary key (id)
);

alter table canvases
    owner to pixel_user;

create table if not exists pixels
(
    id         bigserial,
    canvas_id  integer                                        not null,
    x          integer                                        not null,
    y          integer                                        not null,
    color      varchar(7) default '#000000'::character varying not null,
    owner      bigint,
    created_at timestamp                                      not null,
    updated_at timestamp                                      not null,
    primary key (id),
    constraint fk_canvas
        foreign key (canvas_id) references canvases
            on delete cascade,
    constraint fk_pixel_owner
        foreign key (owner) references users(id)
            on delete set null
);

alter table pixels
    owner to pixel_user;

-- 복합 인덱스: canvas_id + y + x
CREATE INDEX IF NOT EXISTS idx_pixels_canvas_yx
ON pixels (canvas_id, x, y);

create table if not exists user_canvas
(
    id bigserial,
    user_id   bigint                              not null,
    canvas_id integer                             not null,
    try_count integer default 0 not null,
    own_count integer default null,
    joined_at timestamp default CURRENT_TIMESTAMP not null,
    primary key (id),
    unique(user_id, canvas_id),
    foreign key (user_id) references users
        on delete cascade,
    foreign key (canvas_id) references canvases
        on delete cascade
);

alter table user_canvas
    owner to pixel_user;

create table if not exists groups
(
    id         bigserial,
    name      varchar(20) not null,
    created_at timestamp    not null,
    updated_at timestamp    not null,
    max_participants int not null check (max_participants >= 1 and max_participants <= 1000),
    current_participants_count int not null default 1,
    canvas_id bigint not null,
    made_by bigint not null,
    is_default boolean not null default false,
    url VARCHAR(1024) default null,
    overlay_x REAL default 0.0,
    overlay_y REAL default 0.0,
    overlay_height REAL default 0.0,
    overlay_width REAL default 0.0,
    primary key (id),
    unique (canvas_id, name),
    constraint fk_canvas
        foreign key (canvas_id) references canvases(id)
            on delete cascade,
    constraint fk_user
        foreign key (made_by) references users(id)
            on delete cascade
);

alter table groups
    owner to pixel_user;

create table if not exists group_users
(
    id bigserial,
    group_id bigint not null,
    user_id  bigint not null,
    canvas_id bigint not null,
    joined_at timestamp not null default now(),
    primary key (id),
    unique(group_id, user_id),
    foreign key (group_id) references groups(id) on delete cascade,
    foreign key (user_id) references users(id) on delete cascade
);

alter table group_users
    owner to pixel_user;

create table if not exists chats
(
    id bigserial,
    group_id bigint not null,
    user_id bigint not null,
    message varchar(50) not null,
    created_at timestamp not null,
    primary key(id),
    constraint fk_groups
        foreign key (group_id) references groups(id) on delete cascade,
    constraint fk_users
        foreign key (user_id) references users(id) on delete cascade
);

alter table chats
    owner to pixel_user;

-- 캔버스 히스토리
CREATE TABLE IF NOT EXISTS canvas_history (
    canvas_id INTEGER PRIMARY KEY,
    participant_count INTEGER NOT NULL DEFAULT 0,
    total_try_count INTEGER NOT NULL DEFAULT 0,
    top_try_user_id BIGINT,
    top_try_user_count INTEGER,
    top_own_user_id BIGINT,
    top_own_user_count INTEGER,
    image_url VARCHAR(1024),
    captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (canvas_id) REFERENCES canvases(id),
    FOREIGN KEY (top_try_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (top_own_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 관리자 계정 seed (email=pickpx0617@gmail.com, user_name=gmg team)
INSERT INTO users (email, password, created_at, updated_at, user_name, role)
VALUES ('pickpx0617@gmail.com', NULL, '2025-06-17 00:00:00.000000', '2025-06-17 00:00:00.000000', 'gmg team', 'admin')
ON CONFLICT (email) DO NOTHING; 

-- 문제 은행
CREATE TABLE IF NOT EXISTS questions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question TEXT NOT NULL,
    options TEXT[] NOT NULL,
    answer INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS question_user (
    id bigserial PRIMARY KEY,
    user_id BIGINT NOT NULL,
    canvas_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    submitted_answer INTEGER,
    is_correct BOOLEAN NOT NULL default true,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

-- 게임 캔버스에 참여한 유저들의 최종 결과 정보
CREATE TABLE IF NOT EXISTS game_user_result (
    id bigserial PRIMARY KEY,
    user_id BIGINT NOT NULL,
    canvas_id INTEGER NOT NULL,
    rank INTEGER,
    assigned_color VARCHAR(7),
    life INTEGER DEFAULT 2,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (canvas_id) REFERENCES canvases(id) ON DELETE CASCADE
);

-- game_user_result 중복 방지 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_user_result_user_canvas
  ON game_user_result (user_id, canvas_id);