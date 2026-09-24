CREATE TABLE "chokepoint_transits" (
	"id" serial PRIMARY KEY NOT NULL,
	"chokepoint" varchar(32) NOT NULL,
	"recorded_at" timestamp NOT NULL,
	"transit_calls" integer NOT NULL,
	"trade_volume_est" numeric(16, 2),
	"retrieved_at" timestamp,
	"fetch_run_id" integer,
	"source" varchar(64) DEFAULT 'imf_portwatch' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chokepoint_transits" ADD CONSTRAINT "chokepoint_transits_fetch_run_id_fetch_runs_id_fk" FOREIGN KEY ("fetch_run_id") REFERENCES "public"."fetch_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chokepoint_transits_chokepoint_recorded_at_unique" ON "chokepoint_transits" USING btree ("chokepoint","recorded_at");