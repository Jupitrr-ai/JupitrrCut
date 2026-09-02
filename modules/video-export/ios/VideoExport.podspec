Pod::Spec.new do |s|
  s.name           = 'VideoExport'
  s.version        = '1.0.1'
  s.summary        = 'Native video export module for teleprompter app'
  s.description    = 'Provides native iOS video export and stitching capabilities for combining recorded clips into a single video'
  s.author         = 'Jupitrr'
  s.homepage       = 'https://github.com/usepepper/teleprompter'
  s.platforms      = {
    :ios => '15.1',
    :tvos => '15.1'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
