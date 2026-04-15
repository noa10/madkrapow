import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'loading_indicator.dart';
import 'error_banner.dart';

/// Wrapper that handles Riverpod AsyncValue states (loading, error, data).
class AsyncValueWidget<T> extends StatelessWidget {
  const AsyncValueWidget({
    super.key,
    required this.value,
    required this.data,
    this.loading,
    this.error,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) data;
  final Widget Function()? loading;
  final Widget Function(Object error, StackTrace stack)? error;

  @override
  Widget build(BuildContext context) {
    return value.when(
      data: data,
      loading: loading ?? () => const LoadingIndicator(),
      error: error ??
          (err, stack) => ErrorBanner(
                message: err.toString(),
              ),
    );
  }
}
