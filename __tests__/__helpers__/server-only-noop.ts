// Stub que vitest usa en lugar del paquete `server-only` real.
// En el runtime de Next, importar `server-only` desde un client component
// tira un error; los tests corren fuera de Next así que ese check no aplica.
export {}
