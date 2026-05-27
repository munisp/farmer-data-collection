import analytics from '@react-native-firebase/analytics';

/**
 * Firebase Analytics Service
 * Tracks user actions and events throughout the app
 */

class AnalyticsService {
  /**
   * Log screen view
   */
  async logScreenView(screenName: string, screenClass?: string) {
    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
    } catch (error) {
      console.error('Analytics logScreenView error:', error);
    }
  }

  /**
   * Log user login
   */
  async logLogin(method: string) {
    try {
      await analytics().logLogin({
        method, // 'email', 'biometric', etc.
      });
    } catch (error) {
      console.error('Analytics logLogin error:', error);
    }
  }

  /**
   * Log user registration
   */
  async logSignUp(method: string) {
    try {
      await analytics().logSignUp({
        method,
      });
    } catch (error) {
      console.error('Analytics logSignUp error:', error);
    }
  }

  /**
   * Log harvest creation
   */
  async logHarvestCreated(cropType: string, quantity: number) {
    try {
      await analytics().logEvent('harvest_created', {
        crop_type: cropType,
        quantity,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Analytics logHarvestCreated error:', error);
    }
  }

  /**
   * Log expense creation
   */
  async logExpenseCreated(category: string, amount: number) {
    try {
      await analytics().logEvent('expense_created', {
        category,
        amount,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Analytics logExpenseCreated error:', error);
    }
  }

  /**
   * Log marketplace product view
   */
  async logProductView(productId: string, productName: string, price: number) {
    try {
      await analytics().logViewItem({
        items: [{
          item_id: productId,
          item_name: productName,
          price,
        }],
      });
    } catch (error) {
      console.error('Analytics logProductView error:', error);
    }
  }

  /**
   * Log add to cart
   */
  async logAddToCart(productId: string, productName: string, price: number, quantity: number) {
    try {
      await analytics().logAddToCart({
        items: [{
          item_id: productId,
          item_name: productName,
          price,
          quantity,
        }],
        value: price * quantity,
        currency: 'USD',
      });
    } catch (error) {
      console.error('Analytics logAddToCart error:', error);
    }
  }

  /**
   * Log purchase
   */
  async logPurchase(orderId: string, total: number, items: any[]) {
    try {
      await analytics().logPurchase({
        transaction_id: orderId,
        value: total,
        currency: 'USD',
        items,
      });
    } catch (error) {
      console.error('Analytics logPurchase error:', error);
    }
  }

  /**
   * Log ML prediction usage
   */
  async logMLPrediction(predictionType: 'yield' | 'price', cropType: string) {
    try {
      await analytics().logEvent('ml_prediction_used', {
        prediction_type: predictionType,
        crop_type: cropType,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Analytics logMLPrediction error:', error);
    }
  }

  /**
   * Log search
   */
  async logSearch(searchTerm: string, category?: string) {
    try {
      await analytics().logSearch({
        search_term: searchTerm,
        ...(category && { category }),
      });
    } catch (error) {
      console.error('Analytics logSearch error:', error);
    }
  }

  /**
   * Set user properties
   */
  async setUserProperties(properties: Record<string, any>) {
    try {
      for (const [key, value] of Object.entries(properties)) {
        await analytics().setUserProperty(key, String(value));
      }
    } catch (error) {
      console.error('Analytics setUserProperties error:', error);
    }
  }

  /**
   * Set user ID
   */
  async setUserId(userId: string) {
    try {
      await analytics().setUserId(userId);
    } catch (error) {
      console.error('Analytics setUserId error:', error);
    }
  }

  /**
   * Log custom event
   */
  async logEvent(eventName: string, params?: Record<string, any>) {
    try {
      await analytics().logEvent(eventName, params);
    } catch (error) {
      console.error('Analytics logEvent error:', error);
    }
  }
}

export default new AnalyticsService();
