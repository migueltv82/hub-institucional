import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = 'migueltorresv82@gmail.com'
const nueva = process.env.NUEVA_PASSWORD

if (!url || !serviceKey || !nueva) {
  console.error('Faltan variables de entorno')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (error) throw error

const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
if (!user) {
  console.error('No se encontro ese usuario en Auth')
  process.exit(1)
}

const res = await supabase.auth.admin.updateUserById(user.id, { password: nueva })
if (res.error) throw res.error

console.log('Password rotada OK para', email)