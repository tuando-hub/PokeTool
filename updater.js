const VERSION_URL =
  "https://raw.githubusercontent.com/tuando-hub/PokeTool/main/version.json";

const ZIP_URL =
  "https://github.com/tuando-hub/PokeTool/releases/latest/download/PokeTool.zip";

const SKIP_FILES = [
  "pending.json",
  "done.json",
  "failed.json",
  "config.json",
  "log.json",
  "meta.json",
  "ui_state_last.json"
];

function getLocalVersion() {
  try {
    const f = $file.read("app.json");
    if (!f) return "0.0.0";
    return JSON.parse(f.string).version || "0.0.0";
  } catch (e) {
    return "0.0.0";
  }
}

function compare(a, b) {
  const x = String(a).split(".").map(Number);
  const y = String(b).split(".").map(Number);

  for (let i = 0; i < 3; i++) {
    if ((x[i] || 0) > (y[i] || 0)) return 1;
    if ((x[i] || 0) < (y[i] || 0)) return -1;
  }

  return 0;
}

function downloadZip() {
  return new Promise((resolve, reject) => {
    $http.download({
      url: ZIP_URL,
      showsProgress: true,
      handler(resp) {
        if (resp.error) {
          reject(resp.error);
          return;
        }

        const zipPath = "update.zip";

        $file.write({
          data: resp.data,
          path: zipPath
        });

        resolve(zipPath);
      }
    });
  });
}

function unzipFile(zipPath) {
  return new Promise((resolve, reject) => {
    const dest = "update_tmp";

    try {
      if ($file.exists(dest)) {
        $file.delete(dest);
      }
    } catch (e) {
      //
    }

    try {
      $file.mkdir(dest);
    } catch (e) {
      //
    }

    $archiver.unzip({
      path: zipPath,
      dest: dest,
      handler(success) {
        if (!success) {
          reject("UNZIP_FAILED");
          return;
        }

        resolve(dest);
      }
    });
  });
}

function copyDir(src, dst) {
  const items = $file.list(src) || [];

  items.forEach(name => {
    if (SKIP_FILES.includes(name)) return;
    if (name === "update.zip") return;
    if (name === "update_tmp") return;

    const from = src + "/" + name;
    const to = dst ? dst + "/" + name : name;

    if ($file.isDirectory(from)) {
      if (!$file.exists(to)) {
        $file.mkdir(to);
      }

      copyDir(from, to);
      return;
    }

    const data = $file.read(from);
    if (!data) return;

    $file.write({
      data,
      path: to
    });
  });
}

function findRootDir(tmpDir) {
  const items = $file.list(tmpDir) || [];

  if (
    items.length === 1 &&
    $file.isDirectory(tmpDir + "/" + items[0])
  ) {
    return tmpDir + "/" + items[0];
  }

  return tmpDir;
}

function reopenTool() {
  try {
    $app.openURL("jsbox://run?name=PokeTool");
  } catch (e) {
    console.log("REOPEN ERROR:", e.message || e);
  }
}

async function doUpdate() {
  try {
    $ui.toast("Đang tải update...");

    const zipPath = await downloadZip();

    $ui.toast("Đang giải nén...");

    const tmpDir = await unzipFile(zipPath);
    const rootDir = findRootDir(tmpDir);

    $ui.toast("Đang cập nhật file...");

    copyDir(rootDir, "");

    try { $file.delete(zipPath); } catch (e) {
      //
    }
    try { $file.delete(tmpDir); } catch (e) {
      //
    }

    $ui.alert({
      title: "✅ Update xong",
      message: "Bấm OK để mở lại PokeTool.",
      actions: [
        {
          title: "OK",
          handler() {
            reopenTool();
          }
        }
      ]
    });

  } catch (e) {
    $ui.alert("Update lỗi: " + String(e.message || e));
  }
}

async function check() {
  try {
    const local = getLocalVersion();
    const remote = (await $http.get(VERSION_URL)).data;

    console.log("Local:", local);
    console.log("Remote:", remote.version);

    if (compare(remote.version, local) <= 0) return;

    const changelogText = Array.isArray(remote.changelog?.items)
      ? remote.changelog.items.join("\n")
      : "";

    $ui.alert({
      title: "📣 New update 📣",
      message:
        "Version: " + remote.version + "\n\n" +
        changelogText,
      actions: [
        { title: "Later" },
        {
          title: "Update",
          handler: doUpdate
        }
      ]
    });

  } catch (e) {
    console.log("Update failed:", e);
  }
}

module.exports = {
  check
};
