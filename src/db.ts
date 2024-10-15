import pg from 'pg'
const { Pool } = pg

export const pool = new Pool({
  user: "postgres",
  host: "10.90.65.61",
  database: "aprs",
  password: "LJ2008*",
  port: 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})


