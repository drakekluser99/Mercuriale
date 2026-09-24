CREATE TABLE "consumer_price_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" varchar(16) NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"base_year" integer NOT NULL,
	"index_value" numeric(10, 3) NOT NULL,
	"yoy_change_pct" numeric(6, 2),
	"retrieved_at" timestamp,
	"fetch_run_id" integer,
	"source" varchar(64) DEFAULT 'istat_nic' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consumer_price_index" ADD CONSTRAINT "consumer_price_index_fetch_run_id_fetch_runs_id_fk" FOREIGN KEY ("fetch_run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consumer_price_index_category_recorded_at_unique" ON "consumer_price_index" USING btree ("category","recorded_at");