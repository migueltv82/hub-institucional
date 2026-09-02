function clean(value) {
  return String(value ?? '').trim()
}

export function getStudentProfilePhoto(student) {
  const candidates = [
    student?.photo,
    student?.foto,
    student?.photo_url,
    student?.avatar_url,
    student?.raw?.photo,
    student?.raw?.foto,
    student?.raw?.photo_url,
    student?.raw?.avatar_url,
    student?.raw_payload?.photo,
    student?.raw_payload?.foto,
    student?.raw_payload?.photo_url,
    student?.raw_payload?.avatar_url,
  ]

  return candidates.map(clean).find(Boolean) ?? ''
}

export function mergeStudentProfile(student, profile = {}) {
  const next = {
    nombre: clean(profile.nombre),
    apellido: clean(profile.apellido),
    domicilio: clean(profile.domicilio),
    telefono: clean(profile.telefono),
    photo: clean(profile.photo),
  }

  return {
    ...student,
    nombre: next.nombre || student?.nombre,
    apellido: next.apellido || student?.apellido,
    full_name: [next.nombre, next.apellido].filter(Boolean).join(' ').trim() || student?.full_name,
    domicilio: next.domicilio,
    telefono: next.telefono,
    photo: next.photo,
    foto: '',
    photo_url: '',
    avatar_url: '',
    raw: {
      ...(student?.raw && typeof student.raw === 'object' ? student.raw : {}),
      domicilio: next.domicilio,
      telefono: next.telefono,
      photo: next.photo,
      foto: '',
      photo_url: '',
      avatar_url: '',
    },
  }
}
