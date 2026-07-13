import { jsonValue, withTransaction } from "@bus-ai/shared/postgres";

async function seedRows(pool, table, rows, valuesFor) {
  for (const row of rows) {
    const values = valuesFor(row);
    await pool.query(`INSERT INTO ${table} (${values.columns}) VALUES (${values.placeholders}) ON CONFLICT (id) DO NOTHING`, values.params);
  }
}

export async function seedTripRepository(pool, { routes, vehicles, trips, stops = [] }) {
  if (!pool) return;
  await withTransaction(pool, async (db) => {
    await seedRows(db, "routes", routes, (item) => ({
      columns: "id, data",
      placeholders: "$1, $2::jsonb",
      params: [item.id, JSON.stringify(item)]
    }));
    await seedRows(db, "vehicles", vehicles, (item) => ({
      columns: "id, data",
      placeholders: "$1, $2::jsonb",
      params: [item.id, JSON.stringify(item)]
    }));
    await seedRows(db, "trips", trips, (item) => ({
      columns: "id, route_id, departure_date, status, data",
      placeholders: "$1, $2, $3::date, $4, $5::jsonb",
      params: [item.id, item.routeId, item.date, item.status, JSON.stringify(item)]
    }));
    await seedRows(db, "stops", stops, (item) => ({
      columns: "id, city, name",
      placeholders: "$1, $2, $3",
      params: [item.id, item.city, item.name]
    }));
  });
}

export async function loadTripRepository(pool) {
  if (!pool) return null;
  const [routeRows, vehicleRows, tripRows, stopRows] = await Promise.all([
    pool.query("SELECT data FROM routes ORDER BY id"),
    pool.query("SELECT data FROM vehicles ORDER BY id"),
    pool.query("SELECT data FROM trips ORDER BY departure_date, id"),
    pool.query("SELECT id, city, name FROM stops ORDER BY city, name")
  ]);
  return {
    routes: new Map(routeRows.rows.map(({ data }) => {
      const route = jsonValue(data, {});
      return [route.id, route];
    })),
    vehicles: new Map(vehicleRows.rows.map(({ data }) => {
      const vehicle = jsonValue(data, {});
      return [vehicle.id, vehicle];
    })),
    trips: new Map(tripRows.rows.map(({ data }) => {
      const trip = jsonValue(data, {});
      return [trip.id, trip];
    })),
    stops: new Map(stopRows.rows.map((stop) => [stop.id, stop]))
  };
}

export async function saveRoute(pool, route) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO routes (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [route.id, JSON.stringify(route)]
  );
}

export async function deleteRoute(pool, id) {
  if (pool) await pool.query("DELETE FROM routes WHERE id = $1", [id]);
}

export async function saveVehicle(pool, vehicle) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO vehicles (id, data, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    [vehicle.id, JSON.stringify(vehicle)]
  );
}

export async function deleteVehicle(pool, id) {
  if (pool) await pool.query("DELETE FROM vehicles WHERE id = $1", [id]);
}

export async function saveTrip(pool, trip) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO trips (id, route_id, departure_date, status, data, updated_at)
     VALUES ($1, $2, $3::date, $4, $5::jsonb, NOW())
     ON CONFLICT (id) DO UPDATE SET
       route_id = EXCLUDED.route_id,
       departure_date = EXCLUDED.departure_date,
       status = EXCLUDED.status,
       data = EXCLUDED.data,
       updated_at = NOW()`,
    [trip.id, trip.routeId, trip.date, trip.status, JSON.stringify(trip)]
  );
}

export async function deleteTrip(pool, id) {
  if (pool) await pool.query("DELETE FROM trips WHERE id = $1", [id]);
}

export async function saveStop(pool, stop) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO stops (id, city, name, updated_at) VALUES ($1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET city = EXCLUDED.city, name = EXCLUDED.name, updated_at = NOW()`,
    [stop.id, stop.city, stop.name]
  );
}

export async function deleteStop(pool, id) {
  if (pool) await pool.query("DELETE FROM stops WHERE id = $1", [id]);
}
