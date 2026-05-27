# Farmer Data Collection App - Quick Start Guide

## Getting Started in 5 Minutes

This guide will help you quickly understand and start using the Farmer Data Collection Application.

## What is This Application?

The Farmer Data Collection App is a comprehensive web-based platform designed to help agricultural organizations and field agents efficiently register farmers, manage farm data, track crops, and analyze agricultural operations. The application works both online and offline, making it perfect for field work in areas with limited internet connectivity.

## Key Capabilities

The application provides three main capabilities that work together to create a complete farm data management system. First, it enables efficient data collection through a mobile-friendly interface with step-by-step wizards that guide users through farmer registration, farm setup, and crop tracking. The Google Maps integration allows precise location marking and farm boundary drawing. Second, the offline-first architecture ensures that field agents can continue working without internet connectivity, with all data automatically syncing when connection is restored. Third, the powerful analytics dashboard provides real-time insights into farmer distribution, crop patterns, and operational metrics through interactive charts and exportable reports.

## Accessing the Application

To access the application, navigate to the development server URL provided in your project dashboard. The login screen will appear, where you can use the demo credentials to explore the system. Enter **demo@farmer.com** as the email and **demo123** as the password, then click the Sign In button to access the dashboard.

## Understanding the Interface

After logging in, you will see the main dashboard with a sidebar navigation on the left and the main content area on the right. The sidebar contains all major sections of the application, organized into core functions and an admin section. At the top right, you will find the sync status indicator and a Sync Now button for manual synchronization.

The navigation structure includes eight core sections. The Dashboard provides an overview of all farm data with statistics cards showing total farmers, farms, crops, and other key metrics. Quick Add Farmer opens a streamlined 3-step wizard for rapid farmer registration. Manage Farmers displays a searchable directory of all registered farmers with advanced filtering options. The Farms section manages farm profiles and locations, while Crops handles crop cultivation records. Expenses tracks farm operational costs, Reports generates various data reports, and Analytics provides detailed insights through interactive charts and metrics.

## Registering Your First Farmer

To register a farmer, follow this simple workflow. Click on "Quick Add Farmer" in the sidebar to open the registration wizard. The first step collects personal information including the farmer's first name, last name, and phone number (all required), plus optional email and national ID. Click Next to proceed to the location details step.

In the second step, enter the farmer's address information including village, district, and region (all required), with an optional street address field. Click Next to continue to the farm information step.

The third step is where you add farm details. Enter the farm name (required) and farm size in acres (optional). The most important feature here is the interactive Google Map, where you can click anywhere on the map to place a location marker for the farm. You can drag the marker to adjust the position precisely, toggle between Map and Satellite views for better context, and use the zoom controls to get a detailed view of the area. Once you have set the farm location and filled in the required fields, click Submit to save the farmer record.

## Working Offline

One of the most powerful features of this application is its offline capability. When you lose internet connection, the application continues to function normally. All data you enter is stored in a local database on your device. You will see a "Not synced" indicator in the header when offline. Once you regain internet connection, you can click the "Sync Now" button to upload all pending data to the server, or wait for automatic synchronization to occur. The sync status will update to "Synced just now" when complete.

## Viewing Analytics

To access analytics, click on "Analytics" in the sidebar. The analytics dashboard provides comprehensive insights into your farm data collection operations. You can select a date range using the Start Date and End Date pickers, then click Apply to filter the data. The dashboard displays key metrics including total users, total messages, total cost, and engagement rate. Below these metrics, you will find various charts showing channel usage comparison, user engagement trends, feature popularity, cost analysis, and historical trends with daily, weekly, and monthly views. You can export any analytics data to CSV by clicking the "Export CSV" button at the top right.

## Managing Farmers

To view and manage your farmer database, navigate to "Manage Farmers" in the sidebar. This page provides powerful search and filtering capabilities. You can search for farmers by typing in the search box to find matches by name, phone, email, or location. Use the region and district dropdown filters to narrow down results by geographic area. The sort dropdown allows you to order farmers by date or other criteria. At the top of the page, statistics cards show the total number of farmers, regions covered, districts covered, and current filtered results. You can export the entire farmer list or filtered results to CSV using the "Export CSV" button.

## Best Practices

To get the most out of the application, follow these recommended practices. Always start by registering farmers before adding farms, as farms must be associated with a farmer record. Use the Quick Add Farmer wizard for rapid data entry in the field, as it is optimized for speed and mobile use. Take advantage of the map feature to accurately mark farm locations, which is crucial for spatial analysis and planning. Regularly sync your data when you have internet connectivity to ensure your data is backed up and available to other team members. Use the analytics dashboard to monitor your data collection progress and identify areas that need attention. Export data to CSV regularly for backup purposes and for use in other tools or reports.

## Common Tasks

Here are quick instructions for the most common tasks you will perform. To add a new farmer, click "Quick Add Farmer", fill in the 3-step wizard, and click Submit. To search for a farmer, go to "Manage Farmers", type in the search box, and apply filters as needed. To view farmer statistics, navigate to "Manage Farmers" and check the statistics cards at the top. To export data, click the "Export CSV" button on the Manage Farmers or Analytics page. To sync offline data, ensure you have internet connection and click the "Sync Now" button in the header. To view analytics, go to "Analytics", select your date range, and explore the charts and metrics.

## Troubleshooting

If you encounter issues, here are some common solutions. If the sync is not working, check your internet connection, click "Sync Now" manually, and verify that you are logged in. If data is not appearing, try clicking the "Sync Now" button to pull the latest data from the server, refresh the page, and check your filters and search terms. If the map is not loading, ensure you have a stable internet connection, try refreshing the page, and check that location services are enabled in your browser. If you cannot log in, verify your credentials (demo@farmer.com / demo123 for the demo account), clear your browser cache and cookies, and try a different browser if the issue persists.

## Next Steps

Once you are comfortable with the basics, you can explore additional features. Check out the Farms section to manage farm profiles and boundaries. Explore the Crops section to track crop cultivation and harvests. Review the Expenses section to manage farm operational costs. Dive deeper into the Analytics dashboard to discover advanced metrics and trends. Access the Admin section for administrative controls and system configuration. Customize your Settings to personalize your experience.

## Getting Help

If you need assistance, you can refer to the APPLICATION_OVERVIEW.md file for comprehensive documentation, check the todo.md file to see the project roadmap and completed features, review the database schema in drizzle/schema.ts to understand the data structure, or examine the test files in server/__tests__/ to see example usage patterns.

## Summary

The Farmer Data Collection App is designed to be intuitive and easy to use, even for users with limited technical experience. The step-by-step wizards, clear navigation, and offline capabilities make it an ideal tool for field data collection. Start by registering a few farmers to get familiar with the workflow, then explore the analytics and management features to see the full power of the platform.

**Ready to begin?** Log in with the demo credentials and register your first farmer!
