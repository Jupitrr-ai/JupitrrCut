Pod::Spec.new do |s|
  s.name           = 'TeleprompterPip'
  s.version        = '1.0.0'
  s.summary        = 'Native teleprompter PiP module for Jupitrr'
  s.description    = 'Provides native PiP teleprompter playback on iOS using sample-buffer rendering'
  s.author         = 'Jupitrr'
  s.homepage       = 'https://github.com/usepepper/teleprompter'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
