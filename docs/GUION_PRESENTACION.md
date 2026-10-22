# Guion de presentación a la directiva (D3)

Duración: **25 minutos más preguntas**. Datos: el Instituto Superior del Valle (demo), con datos ficticios de `docs/demo-data/` (ver su README). Se presenta en Producción o en un entorno de prueba con la misma versión. Nunca se presenta con datos reales de alumnos.

**Idea central:** "La secretaría carga las planillas que ya usa. Docentes y alumnos entran con su DNI, y las mesas se arman solas respetando las reglas del instituto."

## Preparación (el día anterior)

| # | Qué | Cómo |
|---|---|---|
| 1 | Institución de demo cargada completa | Orden de `docs/demo-data/README.md`: planillas, catálogo, accesos, cursadas e historia |
| 2 | Primer ingreso hecho en las cuentas que se van a mostrar | Entrar una vez con cada una y cambiar la contraseña (el primer ingreso obliga a cambiarla). Anotar las contraseñas nuevas fuera del repo |
| 3 | Llamado armado y publicado | Admin → Armar mesas, con un llamado que incluya **el día de la presentación**: generar precronograma, confirmar tribunales y publicar |
| 4 | Una alumna inscripta a una mesa de **ese día** | Milagros Ortiz (regular en ING102), inscripta desde su portal **antes de las 24 h previas** a la mesa. Pasado ese plazo el portal ya no deja inscribirse |
| 5 | Otra mesa del llamado, **más adelante**, abierta | Para inscribirse en vivo durante la demo |
| 6 | Dos navegadores o perfiles abiertos | Uno con el admin y otro para alternar entre docente y alumna. Cerrar los avisos de "Instalar app" |
| 7 | Plan B | Capturas de cada paso en una carpeta, por si falla la conexión |

**Cuentas de la demo** (todas ficticias; contraseñas nuevas del paso 2):
- **Admin:** la secretaría (`secretaria@valle.demo.invalid`, o el email que usaste al crear la institución).
- **Docente titular de ING102:** Esteban Quiroga, DNI `27904115`.
- **Alumna regular:** Milagros Ortiz, `milagros.ortiz@demo.invalid`.
- **Alumno con una materia libre:** Santiago Navarro, `santiago.navarro@demo.invalid` (libre en Psicología Educacional).

## Recorrido

### 1. El problema y la promesa (2 min, sin pantalla)
- Hoy: planillas sueltas, mesas armadas a mano, actas en papel y preguntas por WhatsApp.
- Con la app: una sola fuente de datos, cada uno ve lo suyo y las reglas del instituto se aplican solas.

### 2. Secretaría: cargar el instituto (6 min)
1. Entrar como admin. Mostrar **Inicio**: el instituto con sus carreras, docentes y alumnos.
2. **Alumnos:** contar que se cargó con la planilla que ya usan. Mostrar la sección "Publicar carreras, planes y materias" (*24 de 24 alumnos con plan*) y "Crear accesos" (*cada alumno entra con su email y su DNI*).
3. **Docentes:** el padrón con sus materias y horarios, cargado desde la planilla docente.
4. "Aplicar las planillas de una vez" e "Importar materias aprobadas y regulares previas": la historia de los alumnos de 2.º año ya está en el sistema.

> Frase: "Nada de esto se tipea a mano: son sus planillas de siempre. Si se cargan dos veces, no se duplica nada."

### 3. Mesas de examen (6 min)
1. **Armar mesas:** el llamado de diciembre ya generado. Mostrar el precronograma y los tribunales.
2. Reglas que se cumplen solas:
   - un vocal solo se asigna los días que asiste;
   - no se citan dos carreras el mismo día;
   - las titularidades se respetan;
   - cada mesa toma el aula donde se cursa la materia.
3. **Mesas y actas:** elegir el día de hoy → "Ver inscriptos" en la mesa de Fonética → "Imprimir acta" (el acta volante en PDF, con el logo del instituto si está cargado).

> Frase: "Lo que antes era una semana de armar mesas, ahora es revisar y publicar."

### 4. La alumna (5 min)
1. Entrar como **Milagros Ortiz**. Mostrar sus **Materias**, su **Estado académico** y sus **Calificaciones** con las notas de 1.º año.
2. **Mesas de examen:** inscribirse en vivo a la mesa abierta (paso 5 de la preparación). La mesa muestra titular, vocales y el cierre de inscripción.
3. Entrar como **Santiago Navarro**: en la materia libre el botón está deshabilitado y la app explica por qué. *Solo se inscribe quien está regular, y lo decide el servidor, no la pantalla.*

### 5. El docente (5 min)
1. Entrar como **Esteban Quiroga**, con su DNI.
2. **Mis materias → Alumnos:** sus alumnos con nombre y DNI. Cargar asistencia y una nota.
3. **Mesas:** en su mesa de hoy aparece "Ver inscriptos" y Milagros figura en la lista. Cargar escrito y oral → "Aprobado" → cerrar el acta.
4. Volver a la alumna: el final ya figura en **Calificaciones**.

> Frase: "El acta la carga el titular el mismo día. Si hay que corregir algo, lo hace secretaría y queda registrado el motivo."

### 6. Cierre (1 min)
- **Seguridad:** cada uno ve solo lo suyo, todo se guarda en una base con respaldo, y los datos del instituto no se mezclan con los de otro.
- **Implementación:** con el visto bueno se carga el instituto real en un día, siguiendo `docs/DIA_D_CHECKLIST.md`.

## Preguntas frecuentes

| Pregunta | Respuesta |
|---|---|
| ¿Se puede usar desde varias computadoras o el celular? | Sí. Cada uno entra con su usuario desde cualquier dispositivo. Los portales de alumnos y docentes se actualizan solos cada pocos segundos. |
| ¿Qué pasa si se carga mal una planilla? | Se corrige la planilla y se vuelve a cargar. No duplica y no borra lo cargado por los docentes. |
| ¿Dos personas de secretaría pueden trabajar a la vez? | En notas, inscripciones y actas, sí. El armado de planillas y mesas conviene hacerlo de a una persona: si dos lo editan a la vez, gana la que guarda último. |
| ¿Y si un docente se olvida la contraseña? | La resetea el Super Admin desde Usuarios. |
| ¿Quién ve las notas? | El alumno ve las suyas, el docente las de sus materias y secretaría las de todo el instituto. |
| ¿Cuánto cuesta? | Se define en la Fase 3: por usuario activo y por legajo antiguo en custodia. *Todavía no hay precio cerrado: no comprometer números.* |

## Qué no mostrar todavía

- **"Eliminar institución":** hoy falla y su reemplazo está en decisión.
- **Super Admin → Opciones avanzadas → "Modo base de datos":** es una opción técnica.
- **Correlativas:** se activan cuando la historia académica real esté completa.
