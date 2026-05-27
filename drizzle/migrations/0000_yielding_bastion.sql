CREATE TABLE "crops" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"farm_id" integer NOT NULL,
	"crop_name" varchar(100) NOT NULL,
	"crop_variety" varchar(100),
	"planting_date" timestamp NOT NULL,
	"expected_harvest_date" timestamp,
	"actual_harvest_date" timestamp,
	"area_planted" numeric(10, 2),
	"area_unit" varchar(20) DEFAULT 'acres',
	"season" varchar(50),
	"status" varchar(50) DEFAULT 'planted',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"farm_id" integer NOT NULL,
	"crop_id" integer,
	"category" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"expense_date" timestamp NOT NULL,
	"payment_method" varchar(50),
	"receipt" varchar(500),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"farm_id" integer NOT NULL,
	"crop_id" integer,
	"input_type" varchar(50) NOT NULL,
	"input_name" varchar(200) NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" varchar(50) NOT NULL,
	"cost_per_unit" integer,
	"total_cost" integer,
	"supplier" varchar(200),
	"purchase_date" varchar NOT NULL,
	"application_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farmers" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone_number" varchar(20),
	"email" varchar(255),
	"address" text,
	"village" varchar(100),
	"district" varchar(100),
	"region" varchar(100),
	"national_id" varchar(50),
	"registration_date" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farms" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"farmer_id" integer NOT NULL,
	"farm_name" varchar(200) NOT NULL,
	"farm_size" numeric(10, 2),
	"farm_size_unit" varchar(20) DEFAULT 'acres',
	"location" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"soil_type" varchar(100),
	"irrigation_type" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"crop_id" integer NOT NULL,
	"harvest_date" timestamp NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" varchar(50) NOT NULL,
	"quality" varchar(50),
	"storage_location" varchar(200),
	"market_price" integer,
	"sold_quantity" numeric(10, 2),
	"revenue" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "livestock" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"farm_id" integer NOT NULL,
	"animal_type" varchar(100) NOT NULL,
	"breed" varchar(100),
	"quantity" integer NOT NULL,
	"purpose" varchar(100),
	"acquisition_date" timestamp NOT NULL,
	"acquisition_cost" integer,
	"current_value" integer,
	"health_status" varchar(50) DEFAULT 'healthy',
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"photo_url" varchar(500) NOT NULL,
	"photo_key" varchar(500) NOT NULL,
	"caption" varchar(500),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
ALTER TABLE "crops" ADD CONSTRAINT "crops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crops" ADD CONSTRAINT "crops_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_inputs" ADD CONSTRAINT "farm_inputs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_inputs" ADD CONSTRAINT "farm_inputs_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_inputs" ADD CONSTRAINT "farm_inputs_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livestock" ADD CONSTRAINT "livestock_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "livestock" ADD CONSTRAINT "livestock_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;