/**
 * Builds an .rpm from the electron-builder output using rpmbuild directly.
 *
 * electron-builder's own rpm target cannot be used here: it shells out to a
 * bundled fpm 1.9.3 (2015), and the spec files that version generates are
 * rejected by RPM 6 (Fedora 43) — rpmbuild exits 1. Writing the spec ourselves
 * removes fpm from the picture entirely.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const DESKTOP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DIST_DIR = path.join(DESKTOP_DIR, "dist");
const UNPACKED = path.join(DIST_DIR, "linux-unpacked");
const ICON_SOURCE = path.join(DESKTOP_DIR, "icon.png");

const APP_ID = "excalidraw-desktop";
const INSTALL_PREFIX = `/opt/${APP_ID}`;

const pkg = JSON.parse(
  await fs.readFile(path.join(DESKTOP_DIR, "package.json"), "utf8"),
);

const run = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });

const exists = async (target) =>
  await fs.access(target).then(
    () => true,
    () => false,
  );

if (!(await exists(path.join(UNPACKED, APP_ID)))) {
  console.error(
    [
      `No unpacked build at ${UNPACKED}`,
      "",
      "Build it first:",
      "  yarn --cwd desktop dist",
    ].join("\n"),
  );
  process.exit(1);
}

const topDir = await fs.mkdtemp(path.join(os.tmpdir(), "excalidraw-rpm-"));
for (const dir of ["SPECS", "BUILD", "BUILDROOT", "RPMS", "SOURCES"]) {
  await fs.mkdir(path.join(topDir, dir), { recursive: true });
}

// The desktop entry ships inside the rpm. CHROME_DESKTOP is what gives the
// Wayland window an app_id matching this entry, which is how the compositor
// finds the icon.
const desktopEntry = `[Desktop Entry]
Type=Application
Name=Excalidraw Desktop
Comment=${pkg.description}
Exec=env CHROME_DESKTOP=${APP_ID}.desktop ${INSTALL_PREFIX}/${APP_ID} --ozone-platform-hint=auto --enable-features=WaylandWindowDecorations %U
Icon=${APP_ID}
Terminal=false
Categories=Graphics;
StartupNotify=true
StartupWMClass=${APP_ID}
`;

const desktopPath = path.join(topDir, "SOURCES", `${APP_ID}.desktop`);
await fs.writeFile(desktopPath, desktopEntry, "utf8");

const spec = `# Prebuilt binaries: skip debuginfo extraction and the whole
# strip/compress/lint pipeline, which chokes on Electron's shipped libraries.
%global debug_package %{nil}
%global __os_install_post %{nil}
%global __brp_check_rpaths %{nil}

Name:           ${APP_ID}
Version:        ${pkg.version}
Release:        1%{?dist}
Summary:        ${pkg.description}
License:        MIT
URL:            ${pkg.homepage}
BuildArch:      x86_64

# The tree is a 300MB pile of prebuilt Chromium libraries; letting rpm derive
# requires/provides from it pulls in unresolvable sonames, so state deps by hand.
AutoReqProv:    no
Requires:       gtk3
Requires:       nss
Requires:       libnotify
Requires:       libXtst
Requires:       libXScrnSaver
Requires:       at-spi2-core
Requires:       libuuid
Requires:       xdg-utils

%description
${pkg.description}

Bundles Chromium via Electron, so rendering matches the browser build.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}${INSTALL_PREFIX}
cp -a %{_appsrc}/. %{buildroot}${INSTALL_PREFIX}/

mkdir -p %{buildroot}%{_bindir}
ln -sf ${INSTALL_PREFIX}/${APP_ID} %{buildroot}%{_bindir}/${APP_ID}

install -Dm644 %{_iconsrc} \\
  %{buildroot}%{_datadir}/icons/hicolor/512x512/apps/${APP_ID}.png
install -Dm644 %{_desktopsrc} \\
  %{buildroot}%{_datadir}/applications/${APP_ID}.desktop

%files
${INSTALL_PREFIX}
# the Chromium sandbox helper only works setuid root
%attr(4755,root,root) ${INSTALL_PREFIX}/chrome-sandbox
%{_bindir}/${APP_ID}
%{_datadir}/icons/hicolor/512x512/apps/${APP_ID}.png
%{_datadir}/applications/${APP_ID}.desktop

%post
update-desktop-database %{_datadir}/applications &>/dev/null || :
touch --no-create %{_datadir}/icons/hicolor &>/dev/null || :
gtk-update-icon-cache -f -t %{_datadir}/icons/hicolor &>/dev/null || :

%postun
update-desktop-database %{_datadir}/applications &>/dev/null || :
gtk-update-icon-cache -f -t %{_datadir}/icons/hicolor &>/dev/null || :

%changelog
* Mon Aug 03 2026 ${pkg.author.name} <${pkg.author.email}> - ${pkg.version}-1
- Packaged with rpmbuild directly; electron-builder's bundled fpm is
  incompatible with RPM 6.
`;

const specPath = path.join(topDir, "SPECS", `${APP_ID}.spec`);
await fs.writeFile(specPath, spec, "utf8");

await run("rpmbuild", [
  "-bb",
  "--define",
  `_topdir ${topDir}`,
  "--define",
  `_appsrc ${UNPACKED}`,
  "--define",
  `_iconsrc ${ICON_SOURCE}`,
  "--define",
  `_desktopsrc ${desktopPath}`,
  specPath,
]);

const rpmsDir = path.join(topDir, "RPMS", "x86_64");
const built = (await fs.readdir(rpmsDir)).filter((n) => n.endsWith(".rpm"));
if (built.length === 0) {
  console.error(`rpmbuild reported success but produced nothing in ${rpmsDir}`);
  process.exit(1);
}

for (const name of built) {
  const target = path.join(DIST_DIR, name);
  await fs.copyFile(path.join(rpmsDir, name), target);
  const { size } = await fs.stat(target);
  console.log(`built ${target} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

await fs.rm(topDir, { recursive: true, force: true });
