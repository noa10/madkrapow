/// Minimal semantic-version comparison for MAJOR.MINOR.PATCH[-PRE].
class SemVer implements Comparable<SemVer> {
  const SemVer(this.major, this.minor, this.patch, {this.pre});

  final int major;
  final int minor;
  final int patch;
  final String? pre;

  static final RegExp _pattern = RegExp(
    r'^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$',
  );

  static SemVer? tryParse(String raw) {
    final match = _pattern.firstMatch(raw.trim());
    if (match == null) return null;
    return SemVer(
      int.parse(match.group(1)!),
      int.parse(match.group(2)!),
      int.parse(match.group(3)!),
      pre: match.group(4),
    );
  }

  @override
  int compareTo(SemVer other) {
    if (major != other.major) return major.compareTo(other.major);
    if (minor != other.minor) return minor.compareTo(other.minor);
    if (patch != other.patch) return patch.compareTo(other.patch);
    // semver rule 11: a non-prerelease outranks the same version with a prerelease.
    if (pre == null && other.pre == null) return 0;
    if (pre == null) return 1;
    if (other.pre == null) return -1;
    return pre!.compareTo(other.pre!);
  }

  bool operator >(SemVer other) => compareTo(other) > 0;
  bool operator <(SemVer other) => compareTo(other) < 0;
  bool operator >=(SemVer other) => compareTo(other) >= 0;
  bool operator <=(SemVer other) => compareTo(other) <= 0;

  @override
  bool operator ==(Object other) =>
      other is SemVer && compareTo(other) == 0;

  @override
  int get hashCode => Object.hash(major, minor, patch, pre);

  @override
  String toString() => pre == null
      ? '$major.$minor.$patch'
      : '$major.$minor.$patch-$pre';
}
