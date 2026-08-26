import 'package:flutter/material.dart';

import '../../components/tav_chip.dart';
import '../../components/tav_money_display.dart';
import '../../data/cobrador_api.dart';
import '../../theme/tav_colors.dart';
import '../../theme/tav_radius.dart';
import '../../theme/tav_space.dart';
import '../../theme/tav_text.dart';
import '../../utils/cobrador_labels.dart';
import '../../utils/labels.dart';

/// Fila de cajero para las listas del cobrador (Mi día, Cajeros por cobrar).
///
/// Muestra deuda, semáforo con motivo, porcentaje del límite, si lleva días
/// sin conectarse y quién lo está atendiendo. La lista ya viene ordenada por
/// urgencia desde el servidor; esta fila no reordena nada.
class CajeroCobradorRow extends StatelessWidget {
  const CajeroCobradorRow({
    super.key,
    required this.cajero,
    this.onTap,
    this.mostrarBanderaAtencion = true,
  });

  final CajeroCobradorDto cajero;
  final VoidCallback? onTap;

  /// Oculta la bandera de atención (útil en listas muy compactas).
  final bool mostrarBanderaAtencion;

  @override
  Widget build(BuildContext context) {
    final ini = inicialesNombre(cajero.nombre);
    final chip = semaforoChipState(cajero.semaforo);
    final pct = (cajero.pct * 100).round();

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(TavRadius.card),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 13),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: TavColors.navy,
                borderRadius: BorderRadius.circular(TavRadius.field),
              ),
              child: Center(
                child: Text(
                  ini,
                  style: TavText.label.copyWith(
                    color: TavColors.surface,
                    fontSize: 13,
                  ),
                ),
              ),
            ),
            const SizedBox(width: TavSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    cajero.nombre,
                    style: TavText.body.copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    cajero.zona ?? 'Sin zona',
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (_tieneBandera) ...[
                    const SizedBox(height: 5),
                    Wrap(
                      spacing: 5,
                      runSpacing: 4,
                      children: _banderas(chip),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: TavSpace.md),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  TavMoneyDisplay(
                    cents: cajero.saldoCents,
                    style: TavText.body.copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    fitted: true,
                  ),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: TavChip(label: cajero.motivo, state: chip),
                  ),
                  const SizedBox(height: 4),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(
                      '$pct% del límite',
                      style: TavText.caption.copyWith(
                        fontSize: 11,
                        color: TavColors.ink3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool get _tieneBandera {
    if (!mostrarBanderaAtencion) return false;
    if (cajero.atendidoPor != null) return true;
    final d = cajero.diasSinConectarse;
    return d != null && d >= 3;
  }

  List<Widget> _banderas(TavChipState chip) {
    final flags = <Widget>[];
    if (cajero.atendidoPor != null) {
      flags.add(TavChip(
        label: 'Lo atiende ${cajero.atendidoPor!.nombre.split(' ').first}',
        state: TavChipState.azul,
      ));
    }
    final d = cajero.diasSinConectarse;
    if (d != null && d >= 3) {
      flags.add(TavChip(
        label: 'Sin conectarse $d días',
        state: TavChipState.gris,
      ));
    }
    return flags;
  }
}

/// Fila de cobro para las listas del cobrador (Mi día, Cuadre, detalle de cierre).
///
/// Muestra el cajero, folio, método, hora y monto. El nombre del cajero se
/// resuelve vía [nombresCajeros] (mapa cajeroId → nombre) porque el cobro
/// solo guarda el id.
class CobroRow extends StatelessWidget {
  const CobroRow({
    super.key,
    required this.cobro,
    required this.nombresCajeros,
    this.onTap,
  });

  final CobroDto cobro;
  final Map<String, String> nombresCajeros;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final nombre = nombresCajeros[cobro.cajeroId] ?? 'Cajero';
    final esEfectivo = cobro.esEfectivo && !cobro.anulado;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(TavRadius.card),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 13),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: cobro.anulado ? TavColors.line2 : TavColors.green50,
                borderRadius: BorderRadius.circular(TavRadius.field),
              ),
              child: Icon(
                cobro.esEfectivo
                    ? Icons.payments_outlined
                    : Icons.account_balance_wallet_outlined,
                color: cobro.anulado ? TavColors.ink4 : TavColors.green600,
                size: 20,
              ),
            ),
            const SizedBox(width: TavSpace.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    nombre,
                    style: TavText.body.copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${cobro.folio} · ${cobro.metodo.label} · ${horaAmPm(cobro.creadoAt)}',
                    style: TavText.caption.copyWith(color: TavColors.ink3),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: TavSpace.md),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 130),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  TavMoneyDisplay(
                    cents: cobro.montoUsdCents,
                    color: cobro.anulado
                        ? TavColors.ink4
                        : TavColors.green600,
                    style: TavText.body.copyWith(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                    ),
                    fitted: true,
                  ),
                  const SizedBox(height: 2),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerRight,
                    child: Text(
                      cobro.anulado
                          ? 'Anulado'
                          : (esEfectivo ? 'efectivo' : 'digital'),
                      style: TavText.caption.copyWith(
                        fontSize: 11,
                        color: cobro.anulado ? TavColors.red700 : TavColors.ink3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
