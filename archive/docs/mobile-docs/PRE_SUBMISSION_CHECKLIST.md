# Pre-Submission Checklist

Complete this checklist before submitting your app to the App Store and Play Store.

---

## ✅ Development Complete

### Code Quality
- [ ] All features implemented and working
- [ ] No console.log statements in production code
- [ ] No TODO or FIXME comments remaining
- [ ] Code follows project conventions
- [ ] TypeScript types are complete (no `any` types)
- [ ] All imports are used (no unused imports)

### Testing
- [ ] All 200+ test cases completed (see TESTING_GUIDE.md)
- [ ] Tested on iOS device (iPhone)
- [ ] Tested on Android device
- [ ] Tested on different screen sizes
- [ ] Tested in portrait and landscape modes
- [ ] Tested with slow/no internet connection
- [ ] Tested offline functionality
- [ ] Tested background sync
- [ ] All user flows tested end-to-end

### Performance
- [ ] App launches in < 3 seconds
- [ ] Screen transitions are smooth (60 FPS)
- [ ] Images load with placeholders
- [ ] Lists scroll smoothly
- [ ] No memory leaks
- [ ] Battery usage is reasonable

### Security
- [ ] Authentication tokens stored securely
- [ ] Biometric authentication works
- [ ] Session timeout implemented
- [ ] Sensitive data not logged
- [ ] HTTPS for all API calls
- [ ] Input validation prevents injection

---

## ✅ Configuration Complete

### App Configuration (app.json)
- [ ] App name is correct
- [ ] Bundle ID/Package name is correct (com.farmerdata.app)
- [ ] Version number is set (1.0.0)
- [ ] Build number is set (1)
- [ ] App icon is set (1024x1024)
- [ ] Splash screen is set
- [ ] Orientation is configured
- [ ] Permissions are listed (camera, location, notifications)
- [ ] Privacy descriptions are provided

### EAS Build Configuration (eas.json)
- [ ] Development profile configured
- [ ] Preview profile configured
- [ ] Production profile configured
- [ ] iOS bundle IDs are correct
- [ ] Android package names are correct
- [ ] Build profiles tested

### Environment Variables
- [ ] API endpoints configured
- [ ] Firebase configuration added
- [ ] Sentry DSN configured
- [ ] All secrets in secure storage
- [ ] No hardcoded credentials

---

## ✅ Assets Complete

### App Icon
- [ ] 1024x1024 PNG created
- [ ] Icon is clear and recognizable
- [ ] Icon follows platform guidelines
- [ ] Icon placed in assets/icon.png
- [ ] Icon referenced in app.json

### Splash Screen
- [ ] Splash screen created
- [ ] Splash screen matches brand
- [ ] Splash screen placed in assets/splash.png
- [ ] Splash screen referenced in app.json

### Screenshots
- [ ] iOS screenshots captured (6.5" required)
- [ ] iOS screenshots captured (5.5" required)
- [ ] Android screenshots captured (minimum 2)
- [ ] Screenshots show key features
- [ ] Screenshots are high quality
- [ ] Screenshots have no placeholder content

### App Preview Video (Optional)
- [ ] Video created (15-30 seconds)
- [ ] Video shows key features
- [ ] Video is high quality
- [ ] Video uploaded to stores

---

## ✅ Monitoring Setup

### Firebase Analytics
- [ ] Firebase project created
- [ ] iOS app added to Firebase
- [ ] Android app added to Firebase
- [ ] GoogleService-Info.plist downloaded (iOS)
- [ ] google-services.json downloaded (Android)
- [ ] Firebase initialized in App.tsx
- [ ] Analytics events implemented
- [ ] Analytics tested and working

### Sentry Error Tracking
- [ ] Sentry project created
- [ ] Sentry DSN configured
- [ ] Sentry auth token configured
- [ ] Sentry initialized in App.tsx
- [ ] Error boundaries implemented
- [ ] Error tracking tested and working

---

## ✅ Legal & Compliance

### Privacy Policy
- [ ] Privacy policy written
- [ ] Privacy policy URL accessible
- [ ] Privacy policy covers data collection
- [ ] Privacy policy covers analytics
- [ ] Privacy policy covers third-party services
- [ ] Privacy policy complies with GDPR
- [ ] Privacy policy complies with CCPA

### Terms of Service
- [ ] Terms of service written (if required)
- [ ] Terms of service URL accessible
- [ ] Terms of service covers app usage
- [ ] Terms of service covers user responsibilities

### Content Rating
- [ ] Content rating questionnaire completed (iOS)
- [ ] Content rating questionnaire completed (Android)
- [ ] Age rating is appropriate
- [ ] Content warnings added if needed

---

## ✅ App Store Connect (iOS)

### App Information
- [ ] App name entered (30 chars max)
- [ ] Subtitle entered (30 chars max)
- [ ] Primary category selected
- [ ] Secondary category selected (optional)
- [ ] Content rights confirmed

### Pricing & Availability
- [ ] Price tier selected (Free or Paid)
- [ ] Availability countries selected
- [ ] Pre-order settings configured (if applicable)

### App Privacy
- [ ] Privacy policy URL added
- [ ] Data collection details provided
- [ ] Data usage details provided
- [ ] Privacy nutrition label completed

### App Information
- [ ] Description written (4000 chars max)
- [ ] Keywords entered (100 chars max)
- [ ] Support URL added
- [ ] Marketing URL added (optional)

### Media
- [ ] 6.5" iPhone screenshots uploaded (required)
- [ ] 5.5" iPhone screenshots uploaded (required)
- [ ] iPad Pro screenshots uploaded (optional)
- [ ] App preview video uploaded (optional)

### Build
- [ ] Production build uploaded
- [ ] Build selected for submission
- [ ] Export compliance answered

### Version Information
- [ ] Version number set (1.0.0)
- [ ] Copyright information added
- [ ] Release notes written

### App Review Information
- [ ] Contact information provided
- [ ] Demo account credentials provided (if login required)
- [ ] Notes for reviewer added (if needed)

---

## ✅ Google Play Console (Android)

### Store Listing
- [ ] App name entered (50 chars max)
- [ ] Short description entered (80 chars max)
- [ ] Full description entered (4000 chars max)
- [ ] App icon uploaded (512x512)
- [ ] Feature graphic uploaded (1024x500)
- [ ] Phone screenshots uploaded (minimum 2)
- [ ] 7" tablet screenshots uploaded (optional)
- [ ] 10" tablet screenshots uploaded (optional)

### Store Settings
- [ ] App category selected
- [ ] Tags added (optional)
- [ ] Contact details provided
- [ ] Privacy policy URL added

### Content Rating
- [ ] Questionnaire completed
- [ ] Rating certificate generated
- [ ] Rating applied to app

### Target Audience
- [ ] Target age group selected
- [ ] Store presence confirmed

### App Content
- [ ] Ads declaration completed
- [ ] In-app purchases declared (if applicable)
- [ ] Content guidelines confirmed

### Release
- [ ] Production build uploaded
- [ ] Release name entered
- [ ] Release notes written
- [ ] Rollout percentage set (or 100%)

---

## ✅ Final Checks

### Build Verification
- [ ] Development build tested
- [ ] Preview build tested
- [ ] Production build created
- [ ] Production build installed and tested
- [ ] No crashes in production build
- [ ] All features work in production build

### Submission Verification
- [ ] All App Store Connect fields completed
- [ ] All Play Console fields completed
- [ ] Screenshots uploaded to both stores
- [ ] Privacy policy accessible
- [ ] Support email working
- [ ] Website accessible (if provided)

### Team Readiness
- [ ] Team notified of submission
- [ ] Support team ready for user questions
- [ ] Marketing materials prepared
- [ ] Social media posts scheduled
- [ ] Launch plan documented

---

## ✅ Submission Timeline

### Week Before Submission
- [ ] Complete all testing
- [ ] Create production builds
- [ ] Prepare all assets
- [ ] Write store listings
- [ ] Set up monitoring

### Day of Submission
- [ ] Final build verification
- [ ] Submit to App Store Connect
- [ ] Submit to Play Console
- [ ] Notify team
- [ ] Monitor submission status

### After Submission
- [ ] Monitor review status daily
- [ ] Respond to reviewer questions promptly
- [ ] Fix any issues found
- [ ] Prepare for launch

---

## ✅ Expected Review Times

### iOS App Store
- **Typical**: 1-3 days
- **Fast**: < 24 hours
- **Slow**: 3-7 days
- **Rejection**: Fix and resubmit

### Google Play Store
- **Typical**: Few hours to 2 days
- **Fast**: < 4 hours
- **Slow**: 2-7 days
- **Rejection**: Fix and resubmit

---

## ✅ Common Rejection Reasons

### iOS
- [ ] App crashes on launch
- [ ] Missing functionality
- [ ] Placeholder content
- [ ] Broken links
- [ ] Missing privacy policy
- [ ] Misleading description
- [ ] Inappropriate content
- [ ] Guideline violations

### Android
- [ ] App crashes on launch
- [ ] Policy violations
- [ ] Misleading content
- [ ] Broken functionality
- [ ] Missing privacy policy
- [ ] Inappropriate content
- [ ] Copyright issues

---

## ✅ Post-Launch Checklist

### Monitoring
- [ ] Monitor Firebase Analytics
- [ ] Monitor Sentry errors
- [ ] Monitor app store reviews
- [ ] Monitor crash reports
- [ ] Monitor user feedback

### Support
- [ ] Set up support email
- [ ] Monitor support requests
- [ ] Respond to user questions
- [ ] Update FAQ based on questions

### Marketing
- [ ] Announce launch on social media
- [ ] Send launch email to users
- [ ] Update website with app links
- [ ] Create press release (if applicable)

### Iteration
- [ ] Collect user feedback
- [ ] Plan next version features
- [ ] Fix reported bugs
- [ ] Improve based on analytics

---

## 📋 Quick Reference

### Submission Commands

```bash
# Build for production
cd mobile
npm run build:prod:all

# Submit to stores
npm run submit:all
```

### Important URLs

- **App Store Connect**: https://appstoreconnect.apple.com/
- **Google Play Console**: https://play.google.com/console/
- **Firebase Console**: https://console.firebase.google.com/
- **Sentry Dashboard**: https://sentry.io/
- **EAS Dashboard**: https://expo.dev/

---

## ✅ Checklist Summary

**Total Items**: ~150
**Completed**: _____ / 150

**Progress**:
- [ ] Development Complete (15 items)
- [ ] Configuration Complete (15 items)
- [ ] Assets Complete (15 items)
- [ ] Monitoring Setup (15 items)
- [ ] Legal & Compliance (15 items)
- [ ] App Store Connect (25 items)
- [ ] Google Play Console (20 items)
- [ ] Final Checks (15 items)
- [ ] Post-Launch (15 items)

---

## 🎉 Ready to Submit!

Once all items are checked, you're ready to submit your app to the App Store and Play Store!

**Good luck with your launch! 🚀**
