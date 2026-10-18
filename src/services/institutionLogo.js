import { isSupabaseConfigured, supabase } from '../lib/supabase.js'

// Logo del colegio para el encabezado de las actas. Se guarda como data URL chica en institutions.logo_url
// mediante la RPC set_institution_logo (solo owner/admin de la institucion o superadmin).

export const LOGO_MAX_WIDTH = 900
export const LOGO_MAX_HEIGHT = 300
export const LOGO_MAX_DATA_URL_LENGTH = 400000
const LOGO_DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/

function clean(value) {
  return String(value ?? '').trim()
}

export function isStoredLogoDataUrl(value) {
  return LOGO_DATA_URL_PATTERN.test(clean(value))
}

// Medidas finales manteniendo la proporcion, sin agrandar logos chicos.
export function fitLogoSize(width, height, maxWidth = LOGO_MAX_WIDTH, maxHeight = LOGO_MAX_HEIGHT) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo del logo.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('El archivo no es una imagen valida.'))
    image.src = src
  })
}

// Achica el logo en el navegador y lo deja en PNG (o JPEG sobre fondo blanco si el PNG queda pesado).
export async function prepareLogoDataUrl(file) {
  if (!file || !/^image\/(png|jpeg)$/.test(file.type)) throw new Error('Elegi un logo en formato PNG o JPG.')
  const image = await loadImage(await readFileAsDataUrl(file))
  const size = fitLogoSize(image.naturalWidth || image.width, image.naturalHeight || image.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0, size.width, size.height)
  let dataUrl = canvas.toDataURL('image/png')
  if (dataUrl.length > LOGO_MAX_DATA_URL_LENGTH) {
    context.globalCompositeOperation = 'destination-over'
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, size.width, size.height)
    dataUrl = canvas.toDataURL('image/jpeg', 0.9)
  }
  if (!isStoredLogoDataUrl(dataUrl) || dataUrl.length > LOGO_MAX_DATA_URL_LENGTH) {
    throw new Error('El logo es demasiado pesado. Proba con una imagen mas chica.')
  }
  return dataUrl
}

export async function saveInstitutionLogo({ institutionId, logoDataUrl }) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Guardar el logo requiere Supabase configurado.')
  if (!clean(institutionId)) throw new Error('No hay una institucion activa.')
  const value = clean(logoDataUrl)
  if (value && !isStoredLogoDataUrl(value)) throw new Error('El logo tiene que ser una imagen PNG o JPG.')

  const { data, error } = await supabase.rpc('set_institution_logo', {
    target_institution_id: institutionId,
    target_logo_url: value,
  })
  if (error) {
    if (error.code === '42501') throw new Error('Solo el owner o admin del colegio puede cambiar el logo.')
    if (error.code === 'PGRST202') throw new Error('Falta actualizar la base de datos para guardar el logo.')
    if (clean(error.message).includes('INSTITUTION_LOGO_INVALID')) throw new Error('El logo no es valido o es demasiado pesado.')
    throw new Error('No se pudo guardar el logo.')
  }
  return clean(data)
}
