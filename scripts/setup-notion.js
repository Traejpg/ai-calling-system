#!/usr/bin/env node
/**
 * Setup Notion Database
 * 
 * Creates the Call Records database with proper schema
 */

require('dotenv').config();
const { Client } = require('@notionhq/client');

const client = new Client({ auth: process.env.NOTION_API_KEY });

const LEADS_DB_ID = process.env.NOTION_LEADS_DATABASE_ID;

async function setupCallRecordsDatabase() {
  try {
    // Get the parent page from leads database
    const leadsDb = await client.databases.retrieve({
      database_id: LEADS_DB_ID
    });
    
    const parentPageId = leadsDb.parent.page_id;
    
    console.log('Creating Call Records database...');
    
    const database = await client.databases.create({
      parent: {
        type: 'page_id',
        page_id: parentPageId
      },
      title: [
        {
          type: 'text',
          text: { content: 'Call Records' }
        }
      ],
      properties: {
        'Call ID': {
          title: {}
        },
        'Lead': {
          relation: {
            database_id: LEADS_DB_ID,
            single_property: {}
          }
        },
        'Phone Number': {
          phone_number: {}
        },
        'Call Date': {
          date: {}
        },
        'Duration': {
          number: {
            format: 'number'
          }
        },
        'Status': {
          select: {
            options: [
              { name: 'Completed', color: 'green' },
              { name: 'Voicemail Left', color: 'yellow' },
              { name: 'No Answer', color: 'gray' },
              { name: 'Busy', color: 'orange' },
              { name: 'Failed', color: 'red' },
              { name: 'DNC', color: 'red' },
              { name: 'Complaint', color: 'red' },
              { name: 'Appointment Scheduled', color: 'blue' }
            ]
          }
        },
        'Lead Temperature': {
          select: {
            options: [
              { name: 'Hot', color: 'red' },
              { name: 'Warm', color: 'yellow' },
              { name: 'Cold', color: 'blue' }
            ]
          }
        },
        'Transcript': {
          rich_text: {}
        },
        'Summary': {
          rich_text: {}
        },
        'Sentiment': {
          select: {
            options: [
              { name: 'Positive', color: 'green' },
              { name: 'Neutral', color: 'gray' },
              { name: 'Negative', color: 'red' }
            ]
          }
        },
        'Key Events': {
          multi_select: {
            options: [
              { name: 'Appointment Scheduled', color: 'green' },
              { name: 'Price Discussed', color: 'yellow' },
              { name: 'Interest Expressed', color: 'green' },
              { name: 'DNC Requested', color: 'red' },
              { name: 'Complaint Raised', color: 'red' },
              { name: 'Voicemail', color: 'gray' }
            ]
          }
        },
        'Next Action': {
          rich_text: {}
        },
        'Twilio Call SID': {
          rich_text: {}
        },
        'Recording URL': {
          url: {}
        },
        'Quality Score': {
          number: {
            format: 'number'
          }
        }
      }
    });
    
    console.log('✅ Call Records database created successfully!');
    console.log('Database ID:', database.id);
    console.log('');
    console.log('Add this to your .env file:');
    console.log(`NOTION_CALL_RECORDS_DATABASE_ID=${database.id}`);
    
  } catch (error) {
    console.error('❌ Failed to create database:', error.message);
    process.exit(1);
  }
}

setupCallRecordsDatabase();