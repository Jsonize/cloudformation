import boto3
import os
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
import re
import datetime
import json


def parseDuration(s):
    durationMap = {
        "second": 1,
        "minute": 60,
        "hour": 60 * 60,
        "day": 24 * 60 * 60,
        "week": 7 * 24 * 60 * 60,
        "month": 30 * 24* 60 * 60
    }
    duration = re.compile('(\d+)\s+([a-z]+[^s])s?').match(s)
    return int(duration.group(1)) * durationMap[duration.group(2)]

def parseLastInvocation(s):
    rate = re.compile('rate\((.*)\)').match(s)
    if rate != None :
        return datetime.datetime.now() - datetime.timedelta(seconds=parseDuration(rate.group(1)))
    cron = re.compile('cron\((.*)\)').match(s)
    if cron != None :
        # TODO
        return None
        # return parseCron(cron)
    return None


def getTable(db, name, hashKey, rangeKey = None):
    try:
        keySchema = [{
            'AttributeName': hashKey,
            'KeyType': 'HASH'
        }]
        attributeDefinitions = [{
           'AttributeName': hashKey,
           'AttributeType': 'S'
       }]
        if rangeKey != None :
            keySchema.append({
                'AttributeName': 'date',
                'KeyType': 'RANGE'
            })
            attributeDefinitions.append({
                'AttributeName': 'date',
                'AttributeType': 'S'
            })
        return db.create_table(
            TableName=name,
            KeySchema=keySchema,
            AttributeDefinitions=attributeDefinitions,
            BillingMode='PAY_PER_REQUEST'
        )
    except ClientError:
        return db.Table(name)


def handler(event, context):
    db = boto3.resource('dynamodb')
    sns = boto3.client('sns')

    dataTable = getTable(db, os.environ['DYNAMO_DATA_TABLE'], 'daemonName', 'date')
    configTable = getTable(db, os.environ['DYNAMO_CONFIG_TABLE'], 'daemonName')
    snsTopic = os.environ['SNS_TOPIC']

    configItems = configTable.scan()
    for configItem in configItems['Items'] :
        print(configItem)
        daemonName = configItem['daemonName']
        minInvocations = configItem['minInvocations']
        thresholdStart = parseDuration(configItem['thresholdStart'])
        timeoutEnd = parseDuration(configItem['timeoutEnd'])
        schedule = parseLastInvocation(configItem['schedule'])
        print(schedule.isoformat())
        dataItems = dataTable.query(KeyConditionExpression=Key('daemonName').eq(daemonName) & Key('date').gte(schedule.isoformat()))
        contexts = {}
        if configItem['contexts'] :
            for ctx in configItem['contexts']:
                contexts[ctx] = {}
        else :
            contexts["default"] = {}
        for dataItem in dataItems['Items'] :
            if "context" in dataItem :
                if not (dataItem['context'] in contexts) :
                    contexts[dataItem['context']] = {}
                context = contexts[dataItem['context']]
            else :
                if not ('default' in contexts) :
                    contexts['default'] = {}
                context = contexts['default']
            if not (dataItem['invocation'] in context) :
                context[dataItem['invocation']] = {'success': 0, 'timeout': 0, 'pending': None}
            invocation = context[dataItem['invocation']]
            invocationDate = datetime.datetime.strptime(dataItem['date'], "%Y-%m-%dT%H:%M:%S")
            if dataItem['state'] == "start" :
                if invocation['pending'] == None :
                    if invocationDate <= schedule + datetime.timedelta(seconds=thresholdStart) :
                        invocation['pending'] = invocationDate
                else :
                    invocation['timeout'] += 1
            if dataItem['state'] == "stop" and invocation['pending'] != None :
                if invocationDate <= invocation['pending'] + datetime.timedelta(seconds=timeoutEnd) :
                    invocation['success'] += 1
                else :
                    invocation['timeout'] += 1
                invocation['pending'] = None
        for ctxKey,invRec in contexts.items() :
            counter = 0
            for invKey,invVal in invRec.items() :
                counter += invVal['success']
            contexts[ctxKey] = counter
        if not contexts :
            contexts['default'] = 0
        for ctx, counter in contexts.items() :
            print(daemonName + " " + ctx + ": " + str(counter))
            if counter < minInvocations :
                print("ALARM " + daemonName + " " + ctx + ": " + str(counter))
                sns.publish(
                    TopicArn=snsTopic,
                    Message=json.dumps({
                        'AlarmName': daemonName + " " + ctx,
                        'OldStateValue': "UNKNOWN",
                        'NewStateValue': "ALARM",
                        'NewStateReason': "ALARM " + daemonName + " " + ctx + ": " + str(counter)
                    }),
                    Subject="ALARM " + daemonName + " " + ctx + ": " + str(counter)
                )