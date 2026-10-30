/* Tiny signed Mach-O application for isolated updater transaction tests. */
#include <mach-o/dyld.h>
#include <sys/types.h>
#include <unistd.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

int main(int argc, char **argv) {
  const char *token = NULL;
  const char *prefix = "--stealth-update-token=";
  for (int i = 1; i < argc; ++i)
    if (strncmp(argv[i], prefix, strlen(prefix)) == 0) token = argv[i] + strlen(prefix);
  if (!token || strlen(token) != 36) return 0;
  char binary[PATH_MAX], resolved[PATH_MAX];
  uint32_t size = sizeof(binary);
  if (_NSGetExecutablePath(binary, &size) != 0 || !realpath(binary, resolved)) return 1;
  char bundle[PATH_MAX];
  snprintf(bundle, sizeof(bundle), "%s", resolved);
  for (int i = 0; i < 3; ++i) { char *p = strrchr(bundle, '/'); if (!p) return 1; *p = '\0'; }
  char parent[PATH_MAX];
  snprintf(parent, sizeof(parent), "%s", bundle);
  *strrchr(parent, '/') = '\0';
  char work[PATH_MAX], file[PATH_MAX];
  snprintf(work, sizeof(work), "%s/.stealth-reader-update-%s", parent, token);
  snprintf(file, sizeof(file), "%s/new.pid", work);
  FILE *output = fopen(file, "w");
  if (!output) return 1;
  fprintf(output, "%d", getpid()); fclose(output);
  snprintf(file, sizeof(file), "%s/launch.args", work);
  output = fopen(file, "w");
  if (output) { for (int i = 1; i < argc; ++i) fprintf(output, "%s\n", argv[i]); fclose(output); }
  snprintf(file, sizeof(file), "%s/Contents/Resources/no-ack", bundle);
  if (access(file, F_OK) == 0) { sleep(30); return 1; }
  snprintf(file, sizeof(file), "%s/app-ready", work);
  output = fopen(file, "w");
  if (!output) return 1;
  fputs(token, output); fclose(output);
  return 0;
}
