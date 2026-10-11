import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261011212155 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "abandoned_cart" drop constraint if exists "abandoned_cart_cart_id_unique";`);
    this.addSql(`create table if not exists "abandoned_cart" ("id" text not null, "cart_id" text not null, "email" text not null, "stage" integer not null default 0, "status" text not null default 'pending', "sent_at" timestamptz null, "recovered_order_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "abandoned_cart_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_abandoned_cart_cart_id_unique" ON "abandoned_cart" ("cart_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_abandoned_cart_deleted_at" ON "abandoned_cart" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "visitor_session" ("id" text not null, "email" text null, "cart_id" text null, "utm_source" text null, "utm_medium" text null, "utm_campaign" text null, "country" text null, "converted_order_id" text null, "last_seen_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "visitor_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_visitor_session_deleted_at" ON "visitor_session" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "session_event" ("id" text not null, "session_id" text not null, "type" text not null, "path" text null, "data" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "session_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_session_event_session_id" ON "session_event" ("session_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_session_event_deleted_at" ON "session_event" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "intent_tag" ("id" text not null, "session_id" text not null, "key" text not null, "value" text not null, "confidence" real not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "intent_tag_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_intent_tag_session_id" ON "intent_tag" ("session_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_intent_tag_deleted_at" ON "intent_tag" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "session_event" add constraint "session_event_session_id_foreign" foreign key ("session_id") references "visitor_session" ("id") on update cascade;`);

    this.addSql(`alter table if exists "intent_tag" add constraint "intent_tag_session_id_foreign" foreign key ("session_id") references "visitor_session" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "session_event" drop constraint if exists "session_event_session_id_foreign";`);

    this.addSql(`alter table if exists "intent_tag" drop constraint if exists "intent_tag_session_id_foreign";`);

    this.addSql(`drop table if exists "abandoned_cart" cascade;`);

    this.addSql(`drop table if exists "visitor_session" cascade;`);

    this.addSql(`drop table if exists "session_event" cascade;`);

    this.addSql(`drop table if exists "intent_tag" cascade;`);
  }

}
