\connect nestjs_db;


create table if not exists users
(
    id         bigserial,
    email      varchar(100) not null,
    password   varchar(100),
    created_at timestamp    not null,
    updated_at timestamp    not null,
    user_name  varchar(50)  not null,
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
    created_at timestamp   not null,
    started_at timestamp   not null default now(),
    ended_at   timestamp   not null,
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
    created_at timestamp                                      not null,
    updated_at timestamp                                      not null,
    primary key (id),
    constraint fk_canvas
        foreign key (canvas_id) references canvases
            on delete cascade
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
    count integer default 0 not null,
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
    max_participants int not null check (max_participants >= 1 and max_participants <= 100),
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

-- 관리자 계정 seed (email=pickpx0617@gmail.com, user_name=gmg team)
INSERT INTO users (email, password, created_at, updated_at, user_name)
VALUES ('pickpx0617@gmail.com', NULL, '2025-06-17 00:00:00.000000', '2025-06-17 00:00:00.000000', 'gmg team')
ON CONFLICT (email) DO NOTHING; 
