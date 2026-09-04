# Cerrar como AUDITADO los pendientes de Planta

## Situación actual (verificada en la base de datos)

En el inventario activo (Semestral 2026-1):

- **Planta: 964 referencias en estado "pendiente"** (todas en ronda 1). Este es el único bloque con pendientes.
  - 832 no tienen ningún conteo registrado (880 de las 964 tienen ERP = 0).
  - 47 tienen solo Conteo 1.
  - 85 tienen Conteo 1 y Conteo 2 (siguen pendientes porque alguna ubicación de la referencia quedó sin contar).
- Almacén no tiene pendientes: 1.423 auditadas (con control), 15 en conflicto, 6 críticas, 3 cerradas forzadas.
- Planta además tiene 18 en conflicto (ronda 3) y 97 críticas, que **no** se tocan en este cierre.

## Qué se va a hacer

Cerrar las 964 referencias pendientes de Planta dejándolas en estado **auditado**, con una cantidad a montar guardada de forma permanente (igual que cualquier validación normal, para que salga en auditoría y en las exportaciones).

Regla de la cantidad a montar, por referencia:

1. Se comparan los totales físicos disponibles de cada conteo (C1, C2, C3, C4) contra el ERP de Planta (Cant.PLd + Cant.PLr).
2. Se elige el conteo cuyo total quede **más cerca del ERP**. En caso de empate gana el conteo más avanzado (C4 > C3 > C2 > C1).
3. Si la referencia no tiene ningún conteo, la cantidad a montar queda en **0**.

Cada ubicación de Planta de esa referencia recibe la cantidad de la ronda elegida (0 si esa ubicación no fue contada), de modo que la suma por referencia coincide exactamente con el total elegido.

Se registra el motivo del cierre como cierre administrativo de pendientes, con el usuario superadmin como responsable, y queda en el historial de auditoría.

## Verificación posterior

- Confirmar que Planta queda con 0 referencias en "pendiente".
- Revisar en pantalla varias referencias representativas: una sin conteos (queda 0), una con solo C1 y una con C1 y C2, comprobando que la cantidad a montar y el descuadre contra el ERP se muestran correctamente.
- Comprobar que la exportación de Planta trae la columna de cantidad a montar llena para estas referencias.

## Detalle técnico

- Se ejecuta en la base de datos sobre `inventory_master` (bloque Planta) y `validated_counts`.
- Las ubicaciones de Planta se identifican por `assigned_admin_id` perteneciente al rol `admin_pp`.
- Las validaciones se insertan una por ubicación (`inventory_id`, `master_reference`, `location_id`, `validated_quantity`, `audit_round`, `reason`), respetando la unicidad existente.
- Se marca `status_pl = 'auditado'` conservando `audit_round_pl` actual.
- No se borra ni modifica ningún conteo de `inventory_counts`; los conteos originales quedan intactos y la referencia se puede reabrir o re-validar después desde el panel de superadmin.
- Antes de ejecutar se genera un respaldo en Excel de las 964 referencias con su ERP, conteos y cantidad elegida, por si hay que revertir.
