import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

import '../../data/menu_repository.dart';
import '../screens/item_detail_screen.dart';

/// Opens the web-style menu quick view in a modal bottom sheet.
///
/// The item route still exists for deep links; selecting an item from the
/// storefront now opens this sheet instead of navigating away from the menu.
Future<void> showItemQuickView(
  BuildContext context,
  String itemId, {
  MenuItemWithModifiers? preview,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    useRootNavigator: true,
    enableDrag: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.5),
    constraints: const BoxConstraints(maxWidth: 640),
    builder: (sheetContext) {
      return _QuickViewSheet(
        itemId: itemId,
        preview: preview,
        onClose: () => Navigator.of(sheetContext).maybePop(),
      );
    },
  );
}

class _QuickViewSheet extends StatelessWidget {
  const _QuickViewSheet({
    required this.itemId,
    required this.onClose,
    this.preview,
  });

  final String itemId;
  final MenuItemWithModifiers? preview;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final keyboardInset = media.viewInsets.bottom;
    // The web quick view grows with its content and only caps at 92dvh.
    // Constrain the sheet instead of forcing it to full height so short
    // items get a compact panel while long modifier lists still scroll.
    // Keep the whole panel above the keyboard; the transparent padding
    // occupies the keyboard area so the sticky footer stays reachable.
    final maxHeight = (media.size.height - keyboardInset) * 0.92;
    return Padding(
      padding: EdgeInsets.only(bottom: keyboardInset),
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Container(
          width: double.infinity,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(AppRadii.xl),
            ),
            border: Border.all(color: AppColors.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            children: [
              ItemDetailScreen(
                itemId: itemId,
                quickView: true,
                preview: preview,
              ),
              // Give the top edge a dedicated drag surface. The scroll view
              // would otherwise win the gesture and only scroll the content.
              const Positioned(
                top: 0,
                left: 0,
                right: 0,
                height: 56,
                child: _QuickViewDragSurface(),
              ),
              Positioned(
                top: 12,
                right: 16,
                child: _QuickViewCloseButton(onPressed: onClose),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickViewCloseButton extends StatelessWidget {
  const _QuickViewCloseButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 2,
      shadowColor: Colors.black.withValues(alpha: 0.45),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: IconButton(
        onPressed: onPressed,
        icon: const Icon(Icons.close, size: 20),
        color: const Color(0xFF18181B),
        padding: EdgeInsets.zero,
        constraints: const BoxConstraints.tightFor(width: 40, height: 40),
        tooltip: 'Close item view',
      ),
    );
  }
}

class _QuickViewDragSurface extends StatelessWidget {
  const _QuickViewDragSurface();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Drag down to close',
      child: Listener(
        behavior: HitTestBehavior.opaque,
        child: Align(
          alignment: Alignment.topCenter,
          child: Container(
            margin: const EdgeInsets.only(top: 10),
            width: 38,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: Colors.black.withValues(alpha: 0.12)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.35),
                  blurRadius: 6,
                  offset: const Offset(0, 1),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
