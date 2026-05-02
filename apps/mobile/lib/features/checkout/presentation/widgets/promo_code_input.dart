import 'package:flutter/material.dart';

import '../../data/checkout_models.dart';

class PromoCodeInput extends StatefulWidget {
  const PromoCodeInput({
    super.key,
    required this.subtotalCents,
    required this.deliveryFeeCents,
    required this.appliedPromos,
    required this.onApply,
    required this.onRemove,
  });

  final int subtotalCents;
  final int deliveryFeeCents;
  final List<AppliedPromo> appliedPromos;
  final Future<void> Function(String code, int subtotalCents, int deliveryFeeCents) onApply;
  final void Function(String code) onRemove;

  @override
  State<PromoCodeInput> createState() => _PromoCodeInputState();
}

class _PromoCodeInputState extends State<PromoCodeInput> {
  final _controller = TextEditingController();
  bool _isValidating = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _handleApply() async {
    final code = _controller.text.trim();
    if (code.isEmpty) return;

    setState(() {
      _isValidating = true;
      _error = null;
    });

    try {
      await widget.onApply(code, widget.subtotalCents, widget.deliveryFeeCents);
      _controller.clear();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString().replaceAll('Exception: ', '');
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isValidating = false);
      }
    }
  }

  String _formatDiscount(AppliedPromo promo) {
    if (promo.discountType == 'percentage') {
      return '${promo.discountValue}% off';
    }
    return 'RM ${(promo.discountCents / 100).toStringAsFixed(2)} off';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Input row
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                decoration: InputDecoration(
                  hintText: 'Promo code',
                  prefixIcon: const Icon(Icons.tag_outlined, size: 20),
                  errorText: _error,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                ),
                textCapitalization: TextCapitalization.characters,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _handleApply(),
                enabled: !_isValidating,
              ),
            ),
            const SizedBox(width: 8),
            FilledButton(
              onPressed: (_isValidating || _controller.text.trim().isEmpty)
                  ? null
                  : _handleApply,
              child: _isValidating
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Text('Apply'),
            ),
          ],
        ),

        // Applied promos
        if (widget.appliedPromos.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...widget.appliedPromos.map(
            (promo) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: theme.colorScheme.primaryContainer.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.check_circle, size: 16, color: Colors.green),
                    const SizedBox(width: 8),
                    Text(
                      promo.code,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      _formatDiscount(promo),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.primary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: const Icon(Icons.close, size: 16),
                      onPressed: () => widget.onRemove(promo.code),
                      constraints: const BoxConstraints(),
                      padding: EdgeInsets.zero,
                      visualDensity: VisualDensity.compact,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
