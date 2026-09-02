package expo.modules.teleprompterpip

import android.app.Activity
import android.app.PictureInPictureParams
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Rational
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.view.setPadding
import kotlin.math.max
import kotlin.math.min

class TeleprompterPipActivity : Activity() {
  companion object {
    private const val EXTRA_TEXT = "text"
    private const val EXTRA_FONT_SIZE = "fontSize"
    private const val EXTRA_SCROLL_SPEED = "scrollSpeed"
    private const val EXTRA_PREP_DELAY = "prepDelay"

    @Volatile
    private var currentInstance: TeleprompterPipActivity? = null

    fun createIntent(
      context: Context,
      text: String,
      fontSize: Float,
      scrollSpeed: Float,
      prepDelaySeconds: Int
    ): Intent {
      return Intent(context, TeleprompterPipActivity::class.java).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        putExtra(EXTRA_TEXT, text)
        putExtra(EXTRA_FONT_SIZE, fontSize)
        putExtra(EXTRA_SCROLL_SPEED, scrollSpeed)
        putExtra(EXTRA_PREP_DELAY, prepDelaySeconds)
      }
    }

    fun finishCurrent() {
      currentInstance?.finish()
    }
  }

  private val handler = Handler(Looper.getMainLooper())
  private var scrollRunnable: Runnable? = null
  private var countdownRunnable: Runnable? = null
  private var scrollStartTimeMs: Long = 0L
  private var scrollSpeedPxPerSecond: Float = 40f
  private var preparationDelaySeconds: Int = 3
  private var countdownSecondsLeft: Int = 3

  private lateinit var root: FrameLayout
  private lateinit var scrollView: ScrollView
  private lateinit var textView: TextView
  private lateinit var prepLabel: TextView

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    currentInstance = this

    scrollSpeedPxPerSecond = intent.getFloatExtra(EXTRA_SCROLL_SPEED, 40f)
    preparationDelaySeconds = max(0, intent.getIntExtra(EXTRA_PREP_DELAY, 3))
    countdownSecondsLeft = preparationDelaySeconds

    root = FrameLayout(this).apply {
      setBackgroundColor(Color.BLACK)
      setPadding(24)
    }

    prepLabel = TextView(this).apply {
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
      gravity = Gravity.CENTER
      text = if (preparationDelaySeconds > 0) "${preparationDelaySeconds}s prep" else ""
      alpha = 0.85f
      setBackgroundColor(Color.TRANSPARENT)
    }

    val prepParams = FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      Gravity.TOP or Gravity.CENTER_HORIZONTAL
    )
    prepParams.topMargin = 16
    root.addView(prepLabel, prepParams)

    scrollView = ScrollView(this).apply {
      isFillViewport = true
      overScrollMode = View.OVER_SCROLL_NEVER
      setBackgroundColor(Color.TRANSPARENT)
    }

    textView = TextView(this).apply {
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, intent.getFloatExtra(EXTRA_FONT_SIZE, 24f))
      typeface = android.graphics.Typeface.SANS_SERIF
      gravity = Gravity.CENTER_HORIZONTAL
      textAlignment = View.TEXT_ALIGNMENT_CENTER
      setLineSpacing(10f, 1f)
      setPadding(32, 180, 32, 240)
      text = intent.getStringExtra(EXTRA_TEXT).orEmpty()
    }

    scrollView.addView(
      textView,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      )
    )

    val scrollParams = FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    root.addView(scrollView, scrollParams)

    setContentView(root)

    root.post {
      enterPipIfPossible()
      if (preparationDelaySeconds > 0) {
        startCountdown()
      } else {
        startScrolling()
      }
    }
  }

  override fun onResume() {
    super.onResume()
    enterPipIfPossible()
  }

  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    enterPipIfPossible()
  }

  override fun onDestroy() {
    super.onDestroy()
    stopTimers()
    if (currentInstance === this) {
      currentInstance = null
    }
  }

  private fun enterPipIfPossible() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    if (isInPictureInPictureMode) return

    val params = PictureInPictureParams.Builder()
      .setAspectRatio(Rational(16, 9))
      .build()

    try {
      enterPictureInPictureMode(params)
    } catch (_: Throwable) {
      // If PiP is unavailable, keep the activity visible. The JS layer will still
      // allow the user to continue with external recording.
    }
  }

  private fun startCountdown() {
    prepLabel.visibility = View.VISIBLE
    countdownRunnable = object : Runnable {
      override fun run() {
        if (countdownSecondsLeft <= 0) {
          prepLabel.text = ""
          prepLabel.visibility = View.GONE
          startScrolling()
          return
        }

        prepLabel.text = "${countdownSecondsLeft}s prep"
        countdownSecondsLeft -= 1
        handler.postDelayed(this, 1000)
      }
    }
    handler.post(countdownRunnable!!)
  }

  private fun startScrolling() {
    scrollView.post {
      scrollStartTimeMs = System.currentTimeMillis()
      val frameDelayMs = 16L

      scrollRunnable = object : Runnable {
        override fun run() {
          // Derive the absolute offset from elapsed time rather than accumulating
          // per-frame deltas: at the default 25 px/s a 16 ms frame advances 0.4 px,
          // and truncating that to an Int every tick rounds to 0 — the text never
          // moves. Tracking the target as a Float and truncating only when applying
          // keeps slow speeds working and avoids cumulative rounding drift.
          val elapsedMs = max(0L, System.currentTimeMillis() - scrollStartTimeMs)
          val targetY = scrollSpeedPxPerSecond * (elapsedMs / 1000f)

          val maxScrollY = max(0, textView.height - scrollView.height)
          val nextY = min(targetY.toInt(), maxScrollY)
          if (nextY != scrollView.scrollY) {
            scrollView.scrollTo(0, nextY)
          }

          if (nextY >= maxScrollY && maxScrollY > 0) {
            scrollRunnable = null
            return
          }

          handler.postDelayed(this, frameDelayMs)
        }
      }

      handler.post(scrollRunnable!!)
    }
  }

  private fun stopTimers() {
    countdownRunnable?.let { handler.removeCallbacks(it) }
    scrollRunnable?.let { handler.removeCallbacks(it) }
    countdownRunnable = null
    scrollRunnable = null
  }
}
