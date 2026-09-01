# Corrección: conteo PT en blanco para supervisores de piso

## Qué encontré

Los datos están bien. En el inventario abierto (Semestral 2026-1):

- 381 ubicaciones PT, todas activas y **todas con supervisor asignado** (pisos 1 a 5).
- 414 referencias en la maestra PT, todas en ronda 1 y estado "pendiente".
- 0 conteos registrados todavía.
- Los cuatro usuarios `piso1pt` … `piso4pt` tienen rol supervisor y sus pisos asignados.

Es decir: no es un problema de datos ni de permisos. El problema es de interfaz.

La pista clave es que viste **los dos bloques** en Gestión Operativa ("Almacén / Planta (MP y PP)" y "Producto Terminado"). Un supervisor de piso PT no debería ver el bloque de Almacén/Planta, porque no tiene ninguna ubicación MP/PP asignada (verificado: cero). Eso solo ocurre cuando la pantalla se dibuja **antes de que termine de cargar el rol** del usuario: mientras el rol es desconocido, la app asume "no es supervisor", muestra los dos bloques y no filtra por usuario. Si desde ahí entras a las tarjetas de Almacén/Planta, la pantalla de conteo sale vacía (correcto: no tienes referencias MP/PP), y parece que "no hay nada por contar".

Además, hoy la pantalla de conteo PT muestra siempre el mismo mensaje vacío, aunque la causa sea otra (error de consulta, sin pisos asignados, maestra sin referencias abiertas). Eso hace imposible distinguir un caso del otro.

## Qué se va a cambiar

1. **Esperar al rol antes de decidir qué mostrar**
   - `Gestión Operativa`, `Conteo MP/PP` y `Conteo PT` mostrarán un estado de carga mientras el rol del usuario no esté resuelto. Nunca más se dibujará la pantalla asumiendo un rol equivocado.

2. **Bloques según lo que el usuario realmente tiene asignado**
   - El bloque PT aparece si el supervisor tiene pisos **o** ubicaciones PT asignadas.
   - El bloque Almacén/Planta aparece solo si tiene ubicaciones MP/PP asignadas (o si es admin/superadmin).
   - Si un supervisor no tiene nada asignado en ninguna de las dos áreas, se muestra un mensaje explícito ("No tienes ubicaciones asignadas en este inventario, contacta al responsable") en lugar de tarjetas que llevan a pantallas vacías.

3. **Pantalla de conteo PT con diagnóstico claro**
   - Si la consulta falla, se muestra el error con un botón "Reintentar" en vez de un vacío silencioso.
   - El estado vacío distinguirá los casos: sin pisos asignados, sin referencias abiertas en esta ronda, o todo ya transcrito en esta ronda.
   - Se mostrará en la cabecera el piso o pisos asignados y el total de ubicaciones asignadas, para que el supervisor confirme de un vistazo que está en el sitio correcto.

4. **Modo administrador correcto**
   - El "modo admin" del conteo PT (ver todos los pisos) se calculará solo con el rol ya cargado, para que un supervisor nunca entre por error en modo admin ni al revés.

## Detalle técnico

- `src/pages/GestionOperativa.tsx`: usar `roleLoading` de `AuthContext` como gate; consultas `enabled: !roleLoading`; contar también `pt_locations` por `assigned_supervisor_id`; recalcular `showPt` / `showMpPp`; estado "sin asignaciones".
- `src/pages/pt/ConteoRoundPT.tsx` y `src/pages/ConteoRound.tsx`: gate por `roleLoading` antes de calcular `isAdminMode`.
- `src/components/pt/PtTranscriptionTab.tsx`: exponer `error` de `useQuery` (bloque de error + reintentar), consulta auxiliar del total de ubicaciones asignadas del usuario para diferenciar los tres estados vacíos, y cabecera con pisos asignados.

Sin cambios en base de datos ni en la lógica de validación C1–C4.
