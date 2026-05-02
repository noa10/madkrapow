import 'package:flutter/material.dart';

class AuthForm extends StatefulWidget {
  const AuthForm({
    super.key,
    required this.onSubmit,
    this.submitLabel = 'Sign In',
    this.showNameField = false,
    this.isLoading = false,
    this.errorText,
    this.rememberedEmail,
    this.showRememberMe = true,
    this.onRememberMeChanged,
  });

  final Future<void> Function({
    required String email,
    required String password,
    String? name,
  }) onSubmit;
  final String submitLabel;
  final bool showNameField;
  final bool isLoading;
  final String? errorText;
  final String? rememberedEmail;
  final bool showRememberMe;
  final ValueChanged<bool>? onRememberMeChanged;

  @override
  State<AuthForm> createState() => _AuthFormState();
}

class _AuthFormState extends State<AuthForm> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _emailController;
  final _passwordController = TextEditingController();
  final _nameController = TextEditingController();
  bool _obscurePassword = true;
  late bool _rememberMe;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(
      text: widget.rememberedEmail ?? '',
    );
    _rememberMe = widget.rememberedEmail != null;
  }

  @override
  void didUpdateWidget(AuthForm oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.rememberedEmail != oldWidget.rememberedEmail) {
      _emailController.text = widget.rememberedEmail ?? '';
      _rememberMe = widget.rememberedEmail != null;
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    widget.onSubmit(
      email: _emailController.text.trim(),
      password: _passwordController.text,
      name: widget.showNameField ? _nameController.text.trim() : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.showNameField) ...[
            TextFormField(
              controller: _nameController,
              textCapitalization: TextCapitalization.words,
              textInputAction: TextInputAction.next,
              decoration: const InputDecoration(
                labelText: 'Full Name',
                prefixIcon: Icon(Icons.person_outline),
              ),
              validator: (value) {
                if (widget.showNameField && (value == null || value.trim().isEmpty)) {
                  return 'Name is required';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
          ],
          TextFormField(
            controller: _emailController,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.next,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Email',
              prefixIcon: Icon(Icons.email_outlined),
            ),
            validator: (value) {
              if (value == null || value.trim().isEmpty) {
                return 'Email is required';
              }
              if (!value.contains('@')) {
                return 'Please enter a valid email';
              }
              return null;
            },
          ),
          const SizedBox(height: 16),
          TextFormField(
            controller: _passwordController,
            obscureText: _obscurePassword,
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _submit(),
            decoration: InputDecoration(
              labelText: 'Password',
              prefixIcon: const Icon(Icons.lock_outline),
              suffixIcon: IconButton(
                icon: Icon(
                  _obscurePassword ? Icons.visibility_off : Icons.visibility,
                ),
                onPressed: () {
                  setState(() => _obscurePassword = !_obscurePassword);
                },
              ),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) {
                return 'Password is required';
              }
              if (value.length < 6) {
                return 'Password must be at least 6 characters';
              }
              return null;
            },
          ),
          if (widget.showRememberMe) ...[
            const SizedBox(height: 8),
            CheckboxListTile(
              value: _rememberMe,
              onChanged: (value) {
                if (value != null) {
                  setState(() => _rememberMe = value);
                  widget.onRememberMeChanged?.call(value);
                }
              },
              title: const Text('Remember Me'),
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
            ),
          ],
          if (widget.errorText != null) ...[
            const SizedBox(height: 12),
            Text(
              widget.errorText!,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 13,
              ),
            ),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: widget.isLoading ? null : _submit,
            child: widget.isLoading
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(widget.submitLabel),
          ),
        ],
      ),
    );
  }
}
