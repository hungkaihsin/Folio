!ifndef BUILD_UNINSTALLER
  Var PagelineShortcutCheckbox
  Var PagelineCreateShortcut
!endif

!macro customPageAfterChangeDir
  !undef MUI_PAGE_CUSTOMFUNCTION_PRE
  !define MUI_PAGE_CUSTOMFUNCTION_PRE PagelineInstFilesPre
  Function PagelineInstFilesPre
    ${If} $INSTDIR == $perUserInstallationFolder
    ${OrIf} $INSTDIR == $perMachineInstallationFolder
      Return
    ${EndIf}
    Call instFilesPre
  FunctionEnd
  Page custom PagelineShortcutPage PagelineShortcutLeave
  Function PagelineShortcutPage
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateCheckbox} 0 12u 100% 24u "Create a desktop shortcut / 建立桌面捷徑"
    Pop $PagelineShortcutCheckbox
    ${NSD_Check} $PagelineShortcutCheckbox
    nsDialogs::Show
  FunctionEnd
  Function PagelineShortcutLeave
    ${NSD_GetState} $PagelineShortcutCheckbox $PagelineCreateShortcut
  FunctionEnd
!macroend

!macro customInstall
  ${IfNot} ${Silent}
    ${If} $PagelineCreateShortcut == ${BST_UNCHECKED}
      Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
    ${Else}
      StrCpy $keepShortcuts "false"
      !insertmacro addDesktopLink "false"
    ${EndIf}
  ${EndIf}
!macroend
