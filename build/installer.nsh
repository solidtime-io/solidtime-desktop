!macro customInstall
  ${If} ${IsNativeARM64}
    DetailPrint "Installing Visual C++ Redistributable for ARM64..."
    ExecWait '"$INSTDIR\resources\vc_redist.arm64.exe" /install /quiet /norestart' $0
    ${If} $0 != 0
      DetailPrint "Warning: VC++ Redistributable installation returned code $0"
    ${Else}
      DetailPrint "VC++ Redistributable installed successfully"
    ${EndIf}
  ${EndIf}
!macroend
