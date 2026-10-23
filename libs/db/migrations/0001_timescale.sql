CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint
SELECT create_hypertable('readings', 'time', chunk_time_interval => INTERVAL '7 days');
--> statement-breakpoint
-- Hourly rollup for charts. WITH NO DATA because continuous aggregates cannot
-- be populated inside the transaction the migrator runs in; the policy below
-- fills it in, and real-time aggregation covers the not-yet-materialized tail.
CREATE MATERIALIZED VIEW readings_hourly
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket(INTERVAL '1 hour', "time") AS bucket,
  planter_id,
  metric,
  avg(value) AS avg,
  min(value) AS min,
  max(value) AS max,
  count(*) AS samples
FROM readings
GROUP BY bucket, planter_id, metric
WITH NO DATA;
--> statement-breakpoint
SELECT add_continuous_aggregate_policy(
  'readings_hourly',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '30 minutes'
);
