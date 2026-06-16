// Script para limpiar datos de prueba en Supabase
// Uso: node scripts/cleanup_test_data.js
// Mantiene: categorias, productos, configuracion, dispositivos, mesas (estructura)

const fs = require('fs');
const path = require('path');

const envTxt = fs.readFileSync(path.join(__dirname, '..', 'demo-pos', '.env.local'), 'utf8');
const env = {};
envTxt.split('\n').filter(l => l.trim() && !l.startsWith('#')).forEach(l => {
  const [k, ...v] = l.split('=');
  env[k.trim()] = v.join('=').trim();
});

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function cleanup() {
  console.log('🧹 Limpiando datos de prueba...\n');

  // 1. Eliminar orden_items
  const { count: itemsCount } = await supabase
    .from('orden_items')
    .select('id', { count: 'exact', head: true });
  console.log(`orden_items: ${itemsCount} → eliminando...`);
  await supabase.from('orden_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  ✅ eliminados');

  // 2. Eliminar pagos
  const { count: pagosCount } = await supabase
    .from('pagos')
    .select('id', { count: 'exact', head: true });
  console.log(`pagos: ${pagosCount} → eliminando...`);
  await supabase.from('pagos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  ✅ eliminados');

  // 3. Eliminar comprobantes
  const { count: compCount } = await supabase
    .from('comprobantes')
    .select('id', { count: 'exact', head: true });
  console.log(`comprobantes: ${compCount} → eliminando...`);
  await supabase.from('comprobantes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  ✅ eliminados');

  // 4. Eliminar cuenta_division
  const { count: divCount } = await supabase
    .from('cuenta_division')
    .select('id', { count: 'exact', head: true });
  console.log(`cuenta_division: ${divCount} → eliminando...`);
  await supabase.from('cuenta_division').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  ✅ eliminados');

  // 5. Eliminar ordenes
  const { count: ordCount } = await supabase
    .from('ordenes')
    .select('id', { count: 'exact', head: true });
  console.log(`ordenes: ${ordCount} → eliminando...`);
  await supabase.from('ordenes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('  ✅ eliminados');

  // 6. Resetear mesas a estado inicial
  console.log('\n🔄 Resetando mesas...');
  const { data: mesas } = await supabase
    .from('mesas')
    .select('id, numero');
  for (const m of mesas || []) {
    const isLlevar = m.numero === 99;
    await supabase
      .from('mesas')
      .update({ estado: 'libre', orden_actual_id: null })
      .eq('id', m.id);
    console.log(`  Mesa ${m.numero} → ${isLlevar ? 'virtual (Para Llevar)' : 'libre'}`);
  }

  // 7. Verificar resultado final
  console.log('\n📊 Estado final:');
  const tablas = ['orden_items', 'ordenes', 'pagos', 'comprobantes', 'cierres_caja', 'cuenta_division'];
  for (const t of tablas) {
    const { count } = await supabase.from(t).select('id', { count: 'exact', head: true });
    console.log(`  ${t}: ${count} filas`);
  }

  console.log('\n✅ Limpieza completa. Base de datos lista para pruebas.');
}

cleanup().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
