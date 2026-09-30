/*
 * linkfix — give the sandbox the two filesystem behaviours Android withholds.
 *
 * Why this exists
 * ---------------
 * Android's SELinux policy does not grant an app process the `link` permission,
 * so a real link() inside the PRoot guest fails with EACCES. Anything that uses
 * hard links for correctness then breaks:
 *
 *   dpkg   rotates its database with link(status, status-old) before every
 *          write (lib/dpkg/atomic-file.c), so `dpkg --configure -a` and every
 *          `apt install` die with "error creating new backup file ...
 *          Permission denied";
 *   git    shares objects with link() when it can;
 *   dsh    its atomic writer links the new file into place.
 *
 * The app deliberately does not pass PRoot's --link2symlink, because that turns
 * link() into a symlink pointing at a hidden temporary object: it reports
 * success, and the file dangles as soon as the object is gone. A wrong success
 * is worse than an honest failure.
 *
 * What this does instead is what a normal filesystem would do: try the real
 * syscall, and when the kernel refuses with EACCES/EPERM, fall back to copying
 * the bytes. The caller gets a second name for the same content, which is all
 * any of the above actually needs (they never require the shared-inode part).
 *
 * chown() is faked on the same reasoning PRoot fakes getuid(): the guest lives
 * as "root" by convention, and an app cannot hand a file to another uid, so the
 * call is reported as successful instead of failing every install.
 *
 * Built with no libc at all — raw syscalls, one glibc symbol for errno — so a
 * preloaded object cannot fail to load over a missing symbol. See
 * scripts/build_linkfix.sh.
 */
#define LINKFIX_NAME "linkfix"

typedef unsigned int u32;
typedef unsigned long u64;
typedef long s64;

/* aarch64 (asm-generic) syscall numbers. */
#define SYS_unlinkat 35
#define SYS_linkat 37
#define SYS_symlinkat 36
#define SYS_openat 56
#define SYS_close 57
#define SYS_read 63
#define SYS_write 64
#define SYS_fchmod 52
#define SYS_fstat 80
#define SYS_readlinkat 78
#define SYS_fstatat 79
#define SYS_fchownat 54
#define SYS_fchown 55

#define AT_FDCWD (-100)
#define AT_SYMLINK_NOFOLLOW 0x100

#define O_RDONLY 0
#define O_WRONLY 1
#define O_CREAT 0100
#define O_EXCL 0200
#define O_NOFOLLOW 0400000
#define O_CLOEXEC 02000000

#define EPERM 1
#define EACCES 13
#define ELOOP 40

#define S_IFMT 0170000
#define S_IFDIR 0040000
#define S_MODE_MASK 07777

/* glibc's errno; the only external symbol this object refers to. */
extern int *__errno_location(void);
#define errno (*__errno_location())

static inline s64 sys6(s64 n, s64 a, s64 b, s64 c, s64 d, s64 e, s64 f) {
	register s64 x8 __asm__("x8") = n;
	register s64 x0 __asm__("x0") = a;
	register s64 x1 __asm__("x1") = b;
	register s64 x2 __asm__("x2") = c;
	register s64 x3 __asm__("x3") = d;
	register s64 x4 __asm__("x4") = e;
	register s64 x5 __asm__("x5") = f;
	__asm__ volatile("svc #0"
		: "+r"(x0)
		: "r"(x8), "r"(x1), "r"(x2), "r"(x3), "r"(x4), "r"(x5)
		: "memory", "cc");
	return x0;
}

#define sys1(n, a) sys6((n), (s64)(a), 0, 0, 0, 0, 0)
#define sys2(n, a, b) sys6((n), (s64)(a), (s64)(b), 0, 0, 0, 0)
#define sys3(n, a, b, c) sys6((n), (s64)(a), (s64)(b), (s64)(c), 0, 0, 0)
#define sys4(n, a, b, c, d) sys6((n), (s64)(a), (s64)(b), (s64)(c), (s64)(d), 0, 0)
#define sys5(n, a, b, c, d, e) sys6((n), (s64)(a), (s64)(b), (s64)(c), (s64)(d), (s64)(e), 0)

/** Run a syscall and normalise the kernel's -errno into the libc convention. */
static s64 call(s64 n, s64 a, s64 b, s64 c, s64 d, s64 e, s64 f) {
	s64 r = sys6(n, a, b, c, d, e, f);
	if (r < 0) {
		errno = (int) -r;
		return -1;
	}
	return r;
}

#define OPENAT(dirfd, path, flags, mode) call(SYS_openat, (dirfd), (s64)(path), (flags), (mode), 0, 0)
#define CLOSE(fd) call(SYS_close, (fd), 0, 0, 0, 0, 0)

/** st_mode/st_dev/st_ino sit at the same offsets in every asm-generic stat layout. */
struct meta {
	u64 dev;
	u64 ino;
	u32 mode;
};

static int stat_fd(int fd, struct meta *out) {
	unsigned char buf[256];
	if (call(SYS_fstat, fd, (s64) buf, 0, 0, 0, 0) < 0) return -1;
	out->dev = *(u64 *) (buf + 0);
	out->ino = *(u64 *) (buf + 8);
	out->mode = *(u32 *) (buf + 16);
	return 0;
}

/*
 * Files that received a fake second name.
 *
 * A copy cannot raise the source inode's link count, and some callers test
 * exactly that: shadow's groupadd/useradd create a lock with link() and then
 * require st_nlink == 2 to prove nobody else holds it, so a plain copy makes
 * every `addgroup` fail with "lock file already used (nlink: 1)". Reporting one
 * more link than the kernel knows about is the smallest lie that keeps those
 * callers working — and it is only ever told for an inode we actually gave a
 * second name.
 */
#define FAKE_MAX 32
static u64 fake_dev[FAKE_MAX];
static u64 fake_ino[FAKE_MAX];
static int fake_count;

static void remember_link(u64 dev, u64 ino) {
	int index;
	for (index = 0; index < fake_count; index++) {
		if (fake_dev[index] == dev && fake_ino[index] == ino) return;
	}
	if (fake_count == FAKE_MAX) {
		for (index = 1; index < FAKE_MAX; index++) {
			fake_dev[index - 1] = fake_dev[index];
			fake_ino[index - 1] = fake_ino[index];
		}
		fake_count--;
	}
	fake_dev[fake_count] = dev;
	fake_ino[fake_count] = ino;
	fake_count++;
}

/** Bump st_nlink in a kernel-filled stat buffer when the inode has a fake name. */
static void adjust_links(unsigned char *buf) {
	u64 dev, ino;
	int index;
	if (fake_count == 0 || buf == 0) return;
	dev = *(u64 *) (buf + 0);
	ino = *(u64 *) (buf + 8);
	for (index = 0; index < fake_count; index++) {
		if (fake_dev[index] == dev && fake_ino[index] == ino) {
			(*(u32 *) (buf + 20))++;
			return;
		}
	}
}

/**
 * Give `newp` the same content as `oldp` when a hard link is impossible.
 *
 * Mirrors what link() must do: fail if the target exists, preserve the mode,
 * and reproduce a symlink as a symlink rather than following it.
 */
static int copy_link(s64 dirfd, const char *oldp, const char *newp) {
	int src = (int) OPENAT(dirfd, oldp, O_RDONLY | O_NOFOLLOW | O_CLOEXEC, 0);
	if (src < 0) {
		/* ELOOP here means the source is a symlink: reproduce it, don't follow it. */
		if (errno == ELOOP) {
			char target[4096];
			s64 n = call(SYS_readlinkat, dirfd, (s64) oldp, (s64) target, sizeof(target) - 1, 0, 0);
			if (n < 0) return -1;
			target[n] = '\0';
			if (call(SYS_symlinkat, (s64) target, (s64) dirfd, (s64) newp, 0, 0, 0) < 0) return -1;
			return 0;
		}
		return -1;
	}

	struct meta info;
	if (stat_fd(src, &info) < 0) {
		CLOSE(src);
		return -1;
	}
	if ((info.mode & S_IFMT) == S_IFDIR) {
		CLOSE(src);
		errno = EPERM;
		return -1;
	}
	/* A mode of 0 means fstat itself failed; 0644 keeps the copy usable. */
	u32 mode = (info.mode & S_MODE_MASK) ? (info.mode & S_MODE_MASK) : 0644;

	int dst = (int) OPENAT(dirfd, newp, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, mode);
	if (dst < 0) {
		CLOSE(src);
		return -1;
	}

	char buffer[32768];
	for (;;) {
		s64 got = call(SYS_read, src, (s64) buffer, sizeof(buffer), 0, 0, 0);
		if (got < 0) goto fail;
		if (got == 0) break;
		char *cursor = buffer;
		while (got > 0) {
			s64 put = call(SYS_write, dst, (s64) cursor, got, 0, 0, 0);
			if (put <= 0) goto fail;
			cursor += put;
			got -= put;
		}
	}
	/* The create honoured umask; link() would not have. */
	if (call(SYS_fchmod, dst, mode, 0, 0, 0, 0) < 0) goto fail;
	if (CLOSE(dst) < 0) {
		dst = -1;
		goto fail;
	}
	CLOSE(src);
	remember_link(info.dev, info.ino);
	return 0;

fail: {
		int saved = errno;
		if (dst >= 0) CLOSE(dst);
		call(SYS_unlinkat, dirfd, (s64) newp, 0, 0, 0, 0);
		CLOSE(src);
		errno = saved;
		return -1;
	}
}

static inline int is_refusal(void) {
	return errno == EACCES || errno == EPERM;
}

/**
 * LINKFIX_FORCE_COPY=1 makes every link() take the copy path.
 *
 * The kernel only refuses link() on the phone, never in a build container, so
 * without this switch the fallback could not be exercised end to end before
 * shipping it. Read from the environment directly: the object has no libc, and
 * `environ` is provided by the dynamic linker either way.
 */
static int force_copy(void) {
	static int cached = -1;
	if (cached >= 0) return cached;
	cached = 0;
	extern char **environ;
	if (environ == 0) return cached;
	const char *needle = "LINKFIX_FORCE_COPY=";
	for (char **entry = environ; *entry != 0; entry++) {
		const char *text = *entry;
		unsigned int i = 0;
		while (needle[i] != '\0' && text[i] == needle[i]) i++;
		if (needle[i] == '\0' && text[i] != '0' && text[i] != '\0') {
			cached = 1;
			return cached;
		}
	}
	return cached;
}

int linkat(int olddirfd, const char *oldp, int newdirfd, const char *newp, int flags) {
	if (!force_copy() && call(SYS_linkat, olddirfd, (s64) oldp, newdirfd, (s64) newp, flags, 0) == 0) {
		return 0;
	}
	if (!force_copy() && !is_refusal()) return -1;
	/* Only the plain same-cwd form is reproduced; anything else keeps the kernel's answer. */
	if (olddirfd != AT_FDCWD || newdirfd != AT_FDCWD) {
		errno = EPERM;
		return -1;
	}
	return copy_link(olddirfd, oldp, newp);
}

int link(const char *oldp, const char *newp) {
	return linkat(AT_FDCWD, oldp, AT_FDCWD, newp, 0);
}

/*
 * Ownership. PRoot reports uid 0 for everything in the guest, so the sandbox is
 * already "root" by convention; the kernel just will not let an app give a file
 * away. Report success and move on.
 */
int fchownat(int dirfd, const char *path, u32 uid, u32 gid, int flags) {
	if (call(SYS_fchownat, dirfd, (s64) path, uid, gid, flags, 0) == 0) return 0;
	if (is_refusal()) return 0;
	return -1;
}

int chown(const char *path, u32 uid, u32 gid) {
	return fchownat(AT_FDCWD, path, uid, gid, 0);
}

int lchown(const char *path, u32 uid, u32 gid) {
	return fchownat(AT_FDCWD, path, uid, gid, AT_SYMLINK_NOFOLLOW);
}

int fchown(int fd, u32 uid, u32 gid) {
	if (call(SYS_fchown, fd, uid, gid, 0, 0, 0) == 0) return 0;
	if (is_refusal()) return 0;
	return -1;
}

/*
 * stat family.
 *
 * These only ever touch the result, and only for an inode that received a fake
 * second name (see remember_link) — with no fake in play the buffer is passed
 * through exactly as the kernel filled it, so behaviour is unchanged. The
 * caller's struct is used as the kernel's own: on aarch64 glibc's struct stat is
 * the asm-generic layout, which is what the syscall writes.
 */
int fstat(int fd, void *buf) {
	if (call(SYS_fstat, fd, (s64) buf, 0, 0, 0, 0) < 0) return -1;
	adjust_links(buf);
	return 0;
}

int fstatat(int dirfd, const char *path, void *buf, int flags) {
	if (call(SYS_fstatat, dirfd, (s64) path, (s64) buf, flags, 0, 0) < 0) return -1;
	adjust_links(buf);
	return 0;
}

int stat(const char *path, void *buf) {
	return fstatat(AT_FDCWD, path, buf, 0);
}

int lstat(const char *path, void *buf) {
	return fstatat(AT_FDCWD, path, buf, AT_SYMLINK_NOFOLLOW);
}
