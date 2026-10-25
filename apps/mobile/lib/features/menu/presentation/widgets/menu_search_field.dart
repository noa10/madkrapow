import 'package:flutter/material.dart';
import 'package:madkrapow_ui/madkrapow_ui.dart';

/// Pill search field used above the menu. Mirrors the web's 44px input,
/// including the focus ring and clear affordance.
class MenuSearchField extends StatefulWidget {
  const MenuSearchField({
    super.key,
    required this.controller,
    required this.onChanged,
    this.onClear,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  /// Extra cleanup (for example, unfocusing) after the field is cleared.
  final VoidCallback? onClear;
  final bool autofocus;

  @override
  State<MenuSearchField> createState() => _MenuSearchFieldState();
}

class _MenuSearchFieldState extends State<MenuSearchField> {
  final FocusNode _focusNode = FocusNode();
  bool _focused = false;

  @override
  void initState() {
    super.initState();
    _focusNode.addListener(_handleFocusChange);
  }

  @override
  void dispose() {
    _focusNode
      ..removeListener(_handleFocusChange)
      ..dispose();
    super.dispose();
  }

  void _handleFocusChange() {
    if (!mounted) return;
    setState(() => _focused = _focusNode.hasFocus);
  }

  void _clear() {
    widget.controller.clear();
    widget.onChanged('');
    widget.onClear?.call();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const textStyle = TextStyle(
      fontSize: 14,
      height: 1.3,
      color: AppColors.foreground,
    );

    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      height: 44,
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadii.pillRadius,
        border: Border.all(
          color: _focused ? AppColors.borderStrong : AppColors.border,
        ),
        boxShadow: _focused
            ? [
                BoxShadow(
                  color: AppColors.accent.withValues(alpha: 0.20),
                  blurRadius: 0,
                  spreadRadius: 2,
                ),
              ]
            : null,
      ),
      child: Row(
        children: [
          const SizedBox(width: 14),
          const Icon(Icons.search, size: 16, color: AppColors.muted),
          const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: widget.controller,
              focusNode: _focusNode,
              autofocus: widget.autofocus,
              onChanged: widget.onChanged,
              textInputAction: TextInputAction.search,
              textAlignVertical: TextAlignVertical.center,
              autocorrect: false,
              enableSuggestions: false,
              cursorColor: AppColors.accent,
              style: textStyle,
              decoration: InputDecoration.collapsed(
                hintText: 'Search the menu',
                hintStyle: theme.textTheme.bodyMedium?.copyWith(
                  color: AppColors.muted,
                  fontSize: 14,
                ),
              ),
            ),
          ),
          ValueListenableBuilder<TextEditingValue>(
            valueListenable: widget.controller,
            builder: (context, value, child) {
              if (value.text.isEmpty) return const SizedBox(width: 14);
              return IconButton(
                onPressed: _clear,
                tooltip: 'Clear search',
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints.tightFor(
                  width: 40,
                  height: 44,
                ),
                icon: const Icon(Icons.close, size: 16),
                color: AppColors.muted,
              );
            },
          ),
        ],
      ),
    );
  }
}
