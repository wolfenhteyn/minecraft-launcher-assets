; Politime Launcher — Inno Setup Script
#define MyAppName "Politime Launcher"
#define MyAppVersion "1.0.7"
#define MyAppPublisher "Politime"
#define MyAppURL "https://ptime.pp.ua/"
#define MyAppExeName "Politime Launcher.exe"

[Setup]
AppId={{D1A2E3B4-2F9A-4EBE-A9B7-D8B330F6C922}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={userappdata}\{#MyAppName}
DisableDirPage=yes
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=dist
OutputBaseFilename=LauncherSetup
SetupIconFile=assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; UAC: request admin rights so SmartScreen lets it through reliably
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
; Sign / trust hints
RestartIfNeededByRun=no
CloseApplications=force
CloseApplicationsFilter=*{#MyAppExeName}*
; Prevent "already running" silent-fail
SetupMutex=PolitimeLauncherSetupMutex

[Languages]
Name: "ukrainian"; MessagesFile: "compiler:Languages\Ukrainian.isl"

[Tasks]
Name: "desktopicon"; Description: "Створити ярлик на Робочому столі"; GroupDescription: "Додаткові завдання:"; Flags: unchecked

[Files]
Source: "dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
; shellexec + runascurrentuser дозволяє відкрити програму без зависання
Filename: "{app}\{#MyAppExeName}"; Description: "Запустити Politime Launcher"; Flags: nowait postinstall skipifsilent shellexec runascurrentuser
