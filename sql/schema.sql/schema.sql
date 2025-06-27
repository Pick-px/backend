create table if not exists users
(
    id         bigserial,
    email      varchar(100) not null,
    password   varchar(100),
    created_at timestamp    not null,
    updated_at timestamp    not null,
    user_name  varchar(50)  not null,
    primary key (id),
    unique (email),
    unique (user_name)
);

alter table users
    owner to pixel_user;

create table if not exists canvases
(
    id         serial,
    title      varchar(50) not null,
    type       text        not null,
    created_at timestamp   not null,
    ended_at   timestamp   not null,
    size_x     integer     not null,
    size_y     integer     not null,
    primary key (id),
    constraint canvases_type_check
        check (type = ANY (ARRAY ['public'::text, 'event'::text]))
);

alter table canvases
    owner to pixel_user;

create table if not exists pixels
(
    id         bigserial,
    canvas_id  integer                                        not null,
    x          integer                                        not null,
    y          integer                                        not null,
    color      varchar(7) default 'FFFFFF'::character varying not null,
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
-- CREATE INDEX IF NOT EXISTS idx_pixels_canvas_yx
-- ON pixels (canvas_id, y, x);

create table if not exists user_canvas
(
    user_id   bigint                              not null,
    canvas_id integer                             not null,
    joined_at timestamp default CURRENT_TIMESTAMP not null,
    primary key (user_id, canvas_id),
    foreign key (user_id) references users
        on delete cascade,
    foreign key (canvas_id) references canvases
        on delete cascade
);

alter table user_canvas
    owner to pixel_user;

