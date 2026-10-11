import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261011214234 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "abandoned_cart" add column if not exists "channel" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "abandoned_cart" drop column if exists "channel";`);
  }

}
