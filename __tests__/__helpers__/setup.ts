// Setup que vitest carga antes de cada test file.
// Setea env vars fake para módulos que crean clientes/configs en import-time:
//   - lib/supabase/admin.ts crea el client con createClient(URL!, KEY!)
//   - lib/supabase/client.ts hace lo mismo
//   - lib/supabase/server.ts también
//
// Los valores son placeholders válidos (no se usan para llamar a Supabase
// real porque los tests mockean el cliente).

process.env.NEXT_PUBLIC_SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'fake-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY     ?? 'fake-service-role-key'
