CREATE TABLE "eu_weighted_averages" (
	"id" serial PRIMARY KEY NOT NULL,
	"fuel_type" varchar(32) NOT NULL,
	"price" numeric(10, 4) NOT NULL,
	"price_net" numeric(10, 4),
	"recorded_at" timestamp NOT NULL,
	"retrieved_at" timestamp,
	"source" varchar(64) DEFAULT 'eu_weekly_oil_bulletin' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "eu_weighted_avg_fuel_recorded_at_unique" ON "eu_weighted_averages" USING btree ("fuel_type","recorded_at");