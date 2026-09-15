CREATE TABLE "swiss_fuel_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"fuel_type" varchar(32) NOT NULL,
	"price_chf" numeric(10, 4) NOT NULL,
	"chf_per_eur" numeric(10, 6),
	"recorded_at" timestamp NOT NULL,
	"retrieved_at" timestamp,
	"source" varchar(64) DEFAULT 'bfs_lik' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "swiss_fuel_fuel_recorded_at_unique" ON "swiss_fuel_prices" USING btree ("fuel_type","recorded_at");